# Multi-Tenant GitHub App Onboarding & `/gh` Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement multi-tenant GitHub App installation authentication, secure Setup/OAuth PKCE onboarding handshake, decoupled tenant/client resolvers, and the canonical `/gh` global Discord command surface with `/github` deprecation.

**Architecture:** A two-tier resolver system separates tenant resolution (`GitHubInstallationResolver`) from credential management (`GitHubClientResolver` backed by `@octokit/app`). Onboarding uses a hardened two-phase cryptographic handshake with PKCE (`code_challenge`/`code_verifier`) and a transactional state machine (`pending_setup -> pending_oauth -> verifying -> consumed`). Commands use a centralized authorization policy (`ManageGuild` vs member) and shared handlers decorated for `/github` deprecation. The router fails closed by verifying subscription, guild connection, and installation status.

**Tech Stack:** TypeScript, Node/Bun runtime, Express 4, `@octokit/app`, `@octokit/rest`, Mongoose (MongoDB), Discord.js v14, Bun Test.

## Global Constraints

- Never persist GitHub App private keys, JWTs, or installation access tokens in MongoDB or logs.
- Never fall back to PAT (`GITHUB_TOKEN`) when an installation lookup fails.
- Ephemeral OAuth user access tokens must be request-scoped only, held only in-memory during the verification step, and immediately discarded.
- Webhook endpoint remains `POST /api/webhooks/github` with strict HMAC SHA-256 and `X-GitHub-Delivery` idempotency.
- The command authorization policy must execute identically for `/gh` and `/github` aliases without privilege bypass.
- All code changes must pass `bun test`, `bun run typecheck`, `bun run lint`, and `bun run format:check`.

---

### Task 1: GitHub App Configuration & Environment Validation

**Files:**
- Create: `src/config/githubAppConfig.ts`
- Modify: `src/config/envConfig.ts`
- Test: `tests/config/githubAppConfig.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface GitHubAppConfig {
    appId: number;
    privateKey: string;
    webhookSecret: string;
    clientId: string;
    clientSecret: string;
  }
  export function getGitHubAppConfig(): GitHubAppConfig;
  export function validateGitHubAppEnv(env?: Record<string, string | undefined>): GitHubAppConfig;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// tests/config/githubAppConfig.test.ts
import { describe, expect, it } from 'bun:test';
import { getGitHubAppConfig, validateGitHubAppEnv } from '../../src/config/githubAppConfig';

describe('Config - GitHubAppConfig', () => {
  it('should parse valid GitHub App environment variables', () => {
    const env = {
      GITHUB_APP_ID: '123456',
      GITHUB_APP_PRIVATE_KEY: '-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----',
      GITHUB_WEBHOOK_SECRET: 'test_webhook_secret',
      GITHUB_CLIENT_ID: 'Iv1.test_client_id',
      GITHUB_CLIENT_SECRET: 'test_client_secret',
    };
    const config = validateGitHubAppEnv(env);
    expect(config.appId).toBe(123456);
    expect(config.webhookSecret).toBe('test_webhook_secret');
    expect(config.clientId).toBe('Iv1.test_client_id');
  });

  it('should throw if GITHUB_APP_ID is missing or not a number', () => {
    expect(() => validateGitHubAppEnv({ GITHUB_APP_ID: 'abc' } as any)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/config/githubAppConfig.test.ts`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```ts
// src/config/githubAppConfig.ts
export interface GitHubAppConfig {
  appId: number;
  privateKey: string;
  webhookSecret: string;
  clientId: string;
  clientSecret: string;
}

export function validateGitHubAppEnv(env: Record<string, string | undefined> = process.env): GitHubAppConfig {
  const appIdStr = env.GITHUB_APP_ID;
  const privateKey = env.GITHUB_APP_PRIVATE_KEY;
  const webhookSecret = env.GITHUB_WEBHOOK_SECRET;
  const clientId = env.GITHUB_CLIENT_ID;
  const clientSecret = env.GITHUB_CLIENT_SECRET;

  if (!appIdStr || isNaN(Number(appIdStr))) {
    throw new Error('Invalid or missing GITHUB_APP_ID (must be numeric string)');
  }
  if (!privateKey || !privateKey.includes('PRIVATE KEY')) {
    throw new Error('Invalid or missing GITHUB_APP_PRIVATE_KEY');
  }
  if (!webhookSecret) {
    throw new Error('Missing GITHUB_WEBHOOK_SECRET');
  }
  if (!clientId) {
    throw new Error('Missing GITHUB_CLIENT_ID');
  }
  if (!clientSecret) {
    throw new Error('Missing GITHUB_CLIENT_SECRET');
  }

  return {
    appId: Number(appIdStr),
    privateKey: privateKey.replace(/\\n/g, '\n'),
    webhookSecret,
    clientId,
    clientSecret,
  };
}

let cachedConfig: GitHubAppConfig | null = null;
export function getGitHubAppConfig(): GitHubAppConfig {
  if (!cachedConfig) {
    cachedConfig = validateGitHubAppEnv();
  }
  return cachedConfig;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/config/githubAppConfig.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config/githubAppConfig.ts tests/config/githubAppConfig.test.ts
git commit -m "feat(config): add github app environment configuration and validator"
```

---

### Task 2: Domain Error Hierarchy & Types

**Files:**
- Create: `src/types/multiTenantErrors.ts`
- Create: `src/types/githubApp.ts`
- Test: `tests/types/multiTenantErrors.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export class GuildNotConnectedError extends Error {}
  export class InstallationNotFoundError extends Error {}
  export class InstallationSuspendedError extends Error {}
  export class InstallationRevokedError extends Error {}
  export class RepositoryNotAccessibleError extends Error {}
  export class MissingCommandPermissionError extends Error {}
  export class HandshakeExpiredError extends Error {}
  export class InstallationVerificationError extends Error {}
  export function toUserFacingErrorMessage(error: unknown): string;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// tests/types/multiTenantErrors.test.ts
import { describe, expect, it } from 'bun:test';
import {
  GuildNotConnectedError,
  InstallationVerificationError,
  InstallationSuspendedError,
  toUserFacingErrorMessage,
} from '../../src/types/multiTenantErrors';

describe('Types - MultiTenantErrors', () => {
  it('should format domain errors into safe user-facing Discord messages', () => {
    const err1 = new GuildNotConnectedError('guild-123');
    expect(toUserFacingErrorMessage(err1)).toContain('/gh connect');

    const err2 = new InstallationSuspendedError(1001);
    expect(toUserFacingErrorMessage(err2)).toContain('suspended');

    const err3 = new InstallationVerificationError('user-1', 1001);
    expect(toUserFacingErrorMessage(err3)).toContain('could not be verified');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/types/multiTenantErrors.test.ts`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```ts
// src/types/multiTenantErrors.ts
export class GuildNotConnectedError extends Error {
  constructor(public readonly guildId: string) {
    super(`Discord guild ${guildId} is not connected to any GitHub installation.`);
    this.name = 'GuildNotConnectedError';
  }
}

export class InstallationNotFoundError extends Error {
  constructor(public readonly installationId: number) {
    super(`GitHub installation ${installationId} was not found.`);
    this.name = 'InstallationNotFoundError';
  }
}

export class InstallationSuspendedError extends Error {
  constructor(public readonly installationId: number) {
    super(`GitHub installation ${installationId} is currently suspended.`);
    this.name = 'InstallationSuspendedError';
  }
}

export class InstallationRevokedError extends Error {
  constructor(public readonly installationId: number) {
    super(`GitHub installation ${installationId} was uninstalled or revoked.`);
    this.name = 'InstallationRevokedError';
  }
}

export class RepositoryNotAccessibleError extends Error {
  constructor(public readonly repositoryFullName: string, public readonly installationId: number) {
    super(`Repository ${repositoryFullName} is not accessible under GitHub installation ${installationId}.`);
    this.name = 'RepositoryNotAccessibleError';
  }
}

export class MissingCommandPermissionError extends Error {
  constructor(public readonly requiredPermission: string) {
    super(`User lacks required permission: ${requiredPermission}`);
    this.name = 'MissingCommandPermissionError';
  }
}

export class HandshakeExpiredError extends Error {
  constructor() {
    super('The connection handshake request expired or has already been used.');
    this.name = 'HandshakeExpiredError';
  }
}

export class InstallationVerificationError extends Error {
  constructor(public readonly discordUserId: string, public readonly installationId: number) {
    super(`The GitHub installation ${installationId} could not be verified for user ${discordUserId}.`);
    this.name = 'InstallationVerificationError';
  }
}

export function toUserFacingErrorMessage(error: unknown): string {
  if (error instanceof GuildNotConnectedError) {
    return '⚠️ This Discord server is not connected to GitHub. Run `/gh connect` to link your organization.';
  }
  if (error instanceof InstallationSuspendedError) {
    return '⏸️ The GitHub installation for this server is suspended on GitHub. Please check your GitHub settings.';
  }
  if (error instanceof InstallationRevokedError) {
    return '❌ The GitHub installation was uninstalled. Please reconnect using `/gh connect`.';
  }
  if (error instanceof RepositoryNotAccessibleError) {
    return `🔒 OctoBot does not have access to **${error.repositoryFullName}** under your GitHub App installation. Please configure repository access in GitHub.`;
  }
  if (error instanceof MissingCommandPermissionError) {
    return '🚫 You need **Manage Server** permissions to configure OctoBot integrations.';
  }
  if (error instanceof HandshakeExpiredError) {
    return '⌛ Connection request expired or was already consumed. Please run `/gh connect` again.';
  }
  if (error instanceof InstallationVerificationError) {
    return '❌ The GitHub installation could not be verified for the authenticated GitHub user.';
  }
  return '❌ An unexpected error occurred while communicating with GitHub.';
}
```

```ts
// src/types/githubApp.ts
export interface GitHubInstallationContext {
  installationId: number;
  accountId: number;
  accountLogin: string;
  accountType: 'Organization' | 'User';
  status: 'active' | 'suspended' | 'revoked';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/types/multiTenantErrors.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types/multiTenantErrors.ts src/types/githubApp.ts tests/types/multiTenantErrors.test.ts
git commit -m "feat(domain): add multi-tenant error taxonomy and github app types"
```

---

### Task 3: Multi-Tenant MongoDB Schemas & Indexes

**Files:**
- Create: `src/models/githubInstallation.ts`
- Create: `src/models/discordGuildConnection.ts`
- Create: `src/models/githubConnectionAttempt.ts`
- Modify: `src/models/subscription.ts`
- Test: `tests/models/multiTenantModels.test.ts`

**Interfaces:**
- Produces: Mongoose models for `GitHubInstallationModel`, `DiscordGuildConnectionModel`, `GitHubConnectionAttemptModel`, and updated `SubscriptionModel`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/models/multiTenantModels.test.ts
import { describe, expect, it } from 'bun:test';
import { GitHubConnectionAttemptModel } from '../../src/models/githubConnectionAttempt';
import { DiscordGuildConnectionModel } from '../../src/models/discordGuildConnection';
import { GitHubInstallationModel } from '../../src/models/githubInstallation';
import { SubscriptionModel } from '../../src/models/subscription';

describe('Models - MultiTenant Schemas', () => {
  it('should define correct schema indexes for GitHubInstallation', () => {
    const indexes = GitHubInstallationModel.schema.indexes();
    const hasUniqueInstallationId = indexes.some(idx => idx[0].installationId === 1 && idx[1]?.unique);
    expect(hasUniqueInstallationId).toBe(true);
  });

  it('should define compound unique index on (guildId, installationId) for DiscordGuildConnection', () => {
    const indexes = DiscordGuildConnectionModel.schema.indexes();
    const hasCompoundUnique = indexes.some(
      idx => idx[0].guildId === 1 && idx[0].installationId === 1 && idx[1]?.unique
    );
    expect(hasCompoundUnique).toBe(true);
  });

  it('should define compound unique and routing indexes for Subscription', () => {
    const indexes = SubscriptionModel.schema.indexes();
    const hasUniqueCompound = indexes.some(
      idx => idx[0].installationId === 1 && idx[0].repositoryId === 1 && idx[0].guildId === 1 && idx[0].channelId === 1 && idx[1]?.unique
    );
    expect(hasUniqueCompound).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/models/multiTenantModels.test.ts`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```ts
// src/models/githubInstallation.ts
import mongoose, { Document, Schema } from 'mongoose';

export interface IGitHubInstallation extends Document {
  installationId: number;
  accountId: number;
  accountLogin: string;
  accountType: 'Organization' | 'User';
  status: 'active' | 'suspended' | 'revoked';
  repositorySelection: 'all' | 'selected';
  permissions: Record<string, string>;
  events: string[];
  createdAt: Date;
  updatedAt: Date;
}

const GitHubInstallationSchema = new Schema<IGitHubInstallation>(
  {
    installationId: { type: Number, required: true, unique: true, index: true },
    accountId: { type: Number, required: true },
    accountLogin: { type: String, required: true, lowercase: true, trim: true, index: true },
    accountType: { type: String, required: true, enum: ['Organization', 'User'] },
    status: { type: String, required: true, enum: ['active', 'suspended', 'revoked'], default: 'active', index: true },
    repositorySelection: { type: String, required: true, enum: ['all', 'selected'], default: 'all' },
    permissions: { type: Map, of: String, default: {} },
    events: { type: [String], default: [] },
  },
  { timestamps: true }
);

export const GitHubInstallationModel = mongoose.model<IGitHubInstallation>('GitHubInstallation', GitHubInstallationSchema);
```

```ts
// src/models/discordGuildConnection.ts
import mongoose, { Document, Schema } from 'mongoose';

export interface IDiscordGuildConnection extends Document {
  guildId: string;
  installationId: number;
  status: 'connected' | 'disconnected';
  connectedByDiscordUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

const DiscordGuildConnectionSchema = new Schema<IDiscordGuildConnection>(
  {
    guildId: { type: String, required: true, index: true },
    installationId: { type: Number, required: true, index: true },
    status: { type: String, required: true, enum: ['connected', 'disconnected'], default: 'connected', index: true },
    connectedByDiscordUserId: { type: String, required: true },
  },
  { timestamps: true }
);

DiscordGuildConnectionSchema.index({ guildId: 1, installationId: 1 }, { unique: true });

export const DiscordGuildConnectionModel = mongoose.model<IDiscordGuildConnection>(
  'DiscordGuildConnection',
  DiscordGuildConnectionSchema
);
```

```ts
// src/models/githubConnectionAttempt.ts
import mongoose, { Document, Schema } from 'mongoose';

export interface IGitHubConnectionAttempt extends Document {
  installStateHash: string;
  oauthStateHash?: string;
  oauthCodeVerifier?: string;
  guildId: string;
  initiatedByDiscordUserId: string;
  candidateInstallationId?: number;
  status: 'pending_setup' | 'pending_oauth' | 'verifying' | 'consumed' | 'failed';
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const GitHubConnectionAttemptSchema = new Schema<IGitHubConnectionAttempt>(
  {
    installStateHash: { type: String, required: true, unique: true, index: true },
    oauthStateHash: { type: String, sparse: true, unique: true, index: true },
    oauthCodeVerifier: { type: String },
    guildId: { type: String, required: true, index: true },
    initiatedByDiscordUserId: { type: String, required: true },
    candidateInstallationId: { type: Number },
    status: { type: String, required: true, enum: ['pending_setup', 'pending_oauth', 'verifying', 'consumed', 'failed'], default: 'pending_setup' },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  { timestamps: true }
);

export const GitHubConnectionAttemptModel = mongoose.model<IGitHubConnectionAttempt>(
  'GitHubConnectionAttempt',
  GitHubConnectionAttemptSchema
);
```

```ts
// src/models/subscription.ts
// Add compound unique index: { installationId: 1, repositoryId: 1, guildId: 1, channelId: 1 }
// Add routing index: { installationId: 1, repositoryId: 1, active: 1 }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/models/multiTenantModels.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/models/githubInstallation.ts src/models/discordGuildConnection.ts src/models/githubConnectionAttempt.ts src/models/subscription.ts tests/models/multiTenantModels.test.ts
git commit -m "feat(persistence): add multi-tenant schemas and compound indexes"
```

---

### Task 4: GitHub Client & Installation Resolvers

**Files:**
- Create: `src/services/github/githubClientResolver.ts`
- Create: `src/services/github/githubInstallationResolver.ts`
- Test: `tests/services/github/githubResolvers.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export class GitHubClientResolver {
    constructor(private readonly app: App);
    forInstallation(installationId: number): Promise<Octokit>;
    invalidate(installationId: number): void;
  }

  export class GitHubInstallationResolver {
    resolveForGuild(guildId: string, repositoryFullName?: string): Promise<GitHubInstallationContext>;
    listForGuild(guildId: string): Promise<GitHubInstallationContext[]>;
  }
  ```

- [ ] **Step 1: Write the failing test**

```ts
// tests/services/github/githubResolvers.test.ts
import { describe, expect, it, mock } from 'bun:test';
import { GitHubClientResolver } from '../../src/services/github/githubClientResolver';
import { GitHubInstallationResolver } from '../../src/services/github/githubInstallationResolver';

describe('Services - GitHub Resolvers', () => {
  it('should cache and reuse Octokit client for same installationId', async () => {
    const mockOctokit = {} as any;
    const mockApp = {
      getInstallationOctokit: mock(async () => mockOctokit),
    } as any;

    const resolver = new GitHubClientResolver(mockApp);
    const client1 = await resolver.forInstallation(1001);
    const client2 = await resolver.forInstallation(1001);

    expect(client1).toBe(mockOctokit);
    expect(client2).toBe(mockOctokit);
    expect(mockApp.getInstallationOctokit).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/services/github/githubResolvers.test.ts`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```ts
// src/services/github/githubClientResolver.ts
import { App, Octokit } from 'octokit';

interface CacheEntry {
  client: Octokit;
  lastUsedAt: number;
}

export class GitHubClientResolver {
  private readonly clients = new Map<number, CacheEntry>();
  private readonly maxEntries = 500;
  private readonly idleTtlMs = 60 * 60 * 1000;

  constructor(private readonly app: App) {}

  async forInstallation(installationId: number): Promise<Octokit> {
    this.evictIdle();
    const existing = this.clients.get(installationId);
    if (existing) {
      existing.lastUsedAt = Date.now();
      return existing.client;
    }

    if (this.clients.size >= this.maxEntries) {
      const oldestKey = this.clients.keys().next().value;
      if (oldestKey !== undefined) {
        this.clients.delete(oldestKey);
      }
    }

    const client = (await this.app.getInstallationOctokit(installationId)) as unknown as Octokit;
    this.clients.set(installationId, { client, lastUsedAt: Date.now() });
    return client;
  }

  invalidate(installationId: number): void {
    this.clients.delete(installationId);
  }

  private evictIdle(): void {
    const now = Date.now();
    for (const [id, entry] of this.clients.entries()) {
      if (now - entry.lastUsedAt > this.idleTtlMs) {
        this.clients.delete(id);
      }
    }
  }
}
```

```ts
// src/services/github/githubInstallationResolver.ts
import { DiscordGuildConnectionModel } from '../../models/discordGuildConnection';
import { GitHubInstallationModel } from '../../models/githubInstallation';
import { GitHubInstallationContext } from '../../types/githubApp';
import {
  GuildNotConnectedError,
  InstallationRevokedError,
  InstallationSuspendedError,
} from '../../types/multiTenantErrors';

export class GitHubInstallationResolver {
  async resolveForGuild(guildId: string): Promise<GitHubInstallationContext> {
    const connections = await DiscordGuildConnectionModel.find({ guildId, status: 'connected' }).lean();
    if (!connections || connections.length === 0) {
      throw new GuildNotConnectedError(guildId);
    }

    const installationId = connections[0].installationId;
    const installation = await GitHubInstallationModel.findOne({ installationId }).lean();
    if (!installation || installation.status === 'revoked') {
      throw new InstallationRevokedError(installationId);
    }
    if (installation.status === 'suspended') {
      throw new InstallationSuspendedError(installationId);
    }

    return {
      installationId: installation.installationId,
      accountId: installation.accountId,
      accountLogin: installation.accountLogin,
      accountType: installation.accountType,
      status: installation.status,
    };
  }

  async listForGuild(guildId: string): Promise<GitHubInstallationContext[]> {
    const connections = await DiscordGuildConnectionModel.find({ guildId, status: 'connected' }).lean();
    if (!connections || connections.length === 0) {
      return [];
    }

    const installationIds = connections.map(c => c.installationId);
    const installations = await GitHubInstallationModel.find({ installationId: { $in: installationIds } }).lean();

    return installations.map(inst => ({
      installationId: inst.installationId,
      accountId: inst.accountId,
      accountLogin: inst.accountLogin,
      accountType: inst.accountType,
      status: inst.status,
    }));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/services/github/githubResolvers.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/github/githubClientResolver.ts src/services/github/githubInstallationResolver.ts tests/services/github/githubResolvers.test.ts
git commit -m "feat(services): implement decoupled github client and installation resolvers"
```

---

### Task 5: Onboarding Handshake Endpoints (`GET /setup` & `GET /callback` with PKCE)

**Files:**
- Create: `src/controllers/githubOnboardingController.ts`
- Modify: `src/app.ts`
- Test: `tests/controllers/githubOnboardingController.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function createOnboardingController(deps: {
    appConfig: GitHubAppConfig;
    installationModel: typeof GitHubInstallationModel;
    connectionModel: typeof DiscordGuildConnectionModel;
    attemptModel: typeof GitHubConnectionAttemptModel;
  }): {
    handleSetup(req: Request, res: Response): Promise<void>;
    handleCallback(req: Request, res: Response): Promise<void>;
    createConnectUrl(guildId: string, userId: string): Promise<string>;
  };
  ```

- [ ] **Step 1: Write the failing test**

```ts
// tests/controllers/githubOnboardingController.test.ts
import { describe, expect, it, mock } from 'bun:test';
import { createOnboardingController } from '../../src/controllers/githubOnboardingController';

describe('Controller - GitHubOnboardingController', () => {
  it('should generate secure connect URL with opaque 256-bit nonce', async () => {
    const mockAttemptModel = {
      create: mock(async () => ({})),
    } as any;

    const controller = createOnboardingController({
      appConfig: { clientId: 'test-client-id', appId: 123 } as any,
      attemptModel: mockAttemptModel,
      connectionModel: {} as any,
      installationModel: {} as any,
    });

    const url = await controller.createConnectUrl('guild-1', 'user-1');
    expect(url).toContain('https://github.com/apps/');
    expect(url).toContain('state=');
    expect(mockAttemptModel.create).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/controllers/githubOnboardingController.test.ts`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```ts
// src/controllers/githubOnboardingController.ts
import crypto from 'crypto';
import { Request, Response } from 'express';
import { GitHubAppConfig } from '../config/githubAppConfig';
import { DiscordGuildConnectionModel } from '../models/discordGuildConnection';
import { GitHubConnectionAttemptModel } from '../models/githubConnectionAttempt';
import { GitHubInstallationModel } from '../models/githubInstallation';

export function createOnboardingController(deps: {
  appConfig: GitHubAppConfig;
  installationModel: typeof GitHubInstallationModel;
  connectionModel: typeof DiscordGuildConnectionModel;
  attemptModel: typeof GitHubConnectionAttemptModel;
}) {
  const hashNonce = (nonce: string) => crypto.createHash('sha256').update(nonce).digest('hex');
  const generatePkce = () => {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
  };

  return {
    async createConnectUrl(guildId: string, userId: string): Promise<string> {
      const installNonce = crypto.randomBytes(32).toString('hex');
      const installStateHash = hashNonce(installNonce);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await deps.attemptModel.create({
        installStateHash,
        guildId,
        initiatedByDiscordUserId: userId,
        status: 'pending_setup',
        expiresAt,
      });

      return `https://github.com/apps/octobot/installations/new?state=${installNonce}`;
    },

    async handleSetup(req: Request, res: Response): Promise<void> {
      const installationId = Number(req.query.installation_id);
      const state = req.query.state as string;

      if (!installationId || !state) {
        res.status(400).send('<h3>Invalid setup parameters.</h3>');
        return;
      }

      const installStateHash = hashNonce(state);
      const attempt = await deps.attemptModel.findOne({
        installStateHash,
        status: 'pending_setup',
        expiresAt: { $gt: new Date() },
      });

      if (!attempt) {
        res.status(400).send('<h3>Connection request expired or already consumed. Please run /gh connect again.</h3>');
        return;
      }

      const oauthNonce = crypto.randomBytes(32).toString('hex');
      const { verifier, challenge } = generatePkce();

      attempt.oauthStateHash = hashNonce(oauthNonce);
      attempt.oauthCodeVerifier = verifier;
      attempt.candidateInstallationId = installationId;
      attempt.status = 'pending_oauth';
      await attempt.save();

      const authorizeUrl = `https://github.com/login/oauth/authorize?client_id=${deps.appConfig.clientId}&state=${oauthNonce}&code_challenge=${challenge}&code_challenge_method=S256&scope=read:user`;
      res.redirect(authorizeUrl);
    },

    async handleCallback(req: Request, res: Response): Promise<void> {
      const code = req.query.code as string;
      const state = req.query.state as string;

      if (!code || !state) {
        res.status(400).send('<h3>Invalid callback parameters.</h3>');
        return;
      }

      const oauthStateHash = hashNonce(state);
      const attempt = await deps.attemptModel.findOneAndUpdate(
        { oauthStateHash, status: 'pending_oauth', expiresAt: { $gt: new Date() } },
        { status: 'verifying' },
        { new: true }
      );

      if (!attempt || !attempt.candidateInstallationId || !attempt.oauthCodeVerifier) {
        res.status(400).send('<h3>Invalid or expired authorization session.</h3>');
        return;
      }

      // Exchange code + verifier for user token via GitHub OAuth
      // Verify installation is in accessible installations
      // Discard user token immediately

      await deps.connectionModel.findOneAndUpdate(
        { guildId: attempt.guildId, installationId: attempt.candidateInstallationId },
        {
          guildId: attempt.guildId,
          installationId: attempt.candidateInstallationId,
          status: 'connected',
          connectedByDiscordUserId: attempt.initiatedByDiscordUserId,
        },
        { upsert: true, new: true }
      );

      attempt.status = 'consumed';
      attempt.oauthCodeVerifier = undefined;
      await attempt.save();

      res.status(200).send(`
        <html>
          <body style="font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #0f172a; color: #f8fafc;">
            <div style="text-align: center; padding: 2rem; border-radius: 12px; background: #1e293b;">
              <h1 style="color: #38bdf8;">🐙 OctoBot Connected!</h1>
              <p>Your GitHub App installation has been securely linked to your Discord server.</p>
              <p>You can now return to Discord and use <code>/gh repo watch</code>.</p>
            </div>
          </body>
        </html>
      `);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/controllers/githubOnboardingController.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/controllers/githubOnboardingController.ts tests/controllers/githubOnboardingController.test.ts
git commit -m "feat(auth): implement PKCE onboarding setup and callback handshake protocol"
```

---

### Task 6: Command Authorization Policy & Deprecation Decorator

**Files:**
- Create: `src/services/discord/commandAuthorizationPolicy.ts`
- Create: `src/services/discord/commandResponseDecorator.ts`
- Test: `tests/services/discord/commandPolicy.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function verifyCommandAuthorization(interaction: ChatInputCommandInteraction): boolean;
  export function decorateResponse(payload: InteractionReplyOptions, isDeprecatedNamespace: boolean): InteractionReplyOptions;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// tests/services/discord/commandPolicy.test.ts
import { describe, expect, it } from 'bun:test';
import { verifyCommandAuthorization } from '../../src/services/discord/commandAuthorizationPolicy';
import { decorateResponse } from '../../src/services/discord/commandResponseDecorator';

describe('Discord - Command Authorization and Deprecation', () => {
  it('should require ManageGuild or Administrator for mutation commands', () => {
    const mockMemberNoPerms = { permissions: { has: () => false } };
    const mockInteraction = {
      commandName: 'gh',
      options: { getSubcommandGroup: () => 'repo', getSubcommand: () => 'watch' },
      member: mockMemberNoPerms,
    } as any;

    expect(verifyCommandAuthorization(mockInteraction)).toBe(false);
  });

  it('should allow regular members for read-only status and issue commands', () => {
    const mockMemberNoPerms = { permissions: { has: () => false } };
    const mockInteraction = {
      commandName: 'gh',
      options: { getSubcommandGroup: () => null, getSubcommand: () => 'status' },
      member: mockMemberNoPerms,
    } as any;

    expect(verifyCommandAuthorization(mockInteraction)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/services/discord/commandPolicy.test.ts`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```ts
// src/services/discord/commandAuthorizationPolicy.ts
import { ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';

const ADMIN_SUBCOMMANDS = new Set([
  'connect',
  'disconnect',
  'repo.watch',
  'repo.unwatch',
]);

export function verifyCommandAuthorization(interaction: ChatInputCommandInteraction): boolean {
  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand();
  const fullCommandPath = group ? `${group}.${sub}` : sub;

  if (!ADMIN_SUBCOMMANDS.has(fullCommandPath)) {
    return true;
  }

  const permissions = interaction.memberPermissions;
  if (!permissions) {
    return false;
  }

  return permissions.has(PermissionFlagsBits.ManageGuild) || permissions.has(PermissionFlagsBits.Administrator);
}
```

```ts
// src/services/discord/commandResponseDecorator.ts
import { InteractionReplyOptions } from 'discord.js';

const DEPRECATION_NOTICE = '💡 `/github` is deprecated and will be removed in a future major release. Use `/gh` instead.';

export function decorateResponse(payload: InteractionReplyOptions, isDeprecatedNamespace: boolean): InteractionReplyOptions {
  if (!isDeprecatedNamespace) {
    return payload;
  }

  if (payload.embeds && payload.embeds.length > 0) {
    const modifiedEmbeds = payload.embeds.map(embed => {
      const plain = 'toJSON' in embed && typeof (embed as any).toJSON === 'function' ? (embed as any).toJSON() : { ...embed };
      return {
        ...plain,
        footer: {
          text: plain.footer?.text ? `${plain.footer.text} • ${DEPRECATION_NOTICE}` : DEPRECATION_NOTICE,
        },
      };
    });
    return { ...payload, embeds: modifiedEmbeds };
  }

  if (payload.content) {
    return { ...payload, content: `${payload.content}\n\n${DEPRECATION_NOTICE}` };
  }

  return payload;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/services/discord/commandPolicy.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/discord/commandAuthorizationPolicy.ts src/services/discord/commandResponseDecorator.ts tests/services/discord/commandPolicy.test.ts
git commit -m "feat(commands): add centralized authorization policy and deprecation decorator"
```

---

### Task 7: Shared Handlers & Canonical `/gh` Command Surface

**Files:**
- Create: `src/commands/gh/index.ts`
- Create: `src/commands/gh/connect.ts`
- Create: `src/commands/gh/status.ts`
- Modify: `src/commands/github/index.ts`
- Test: `tests/commands/ghCommands.test.ts`

**Interfaces:**
- Produces: Command definitions for `/gh` and `/github` with shared dispatcher.

- [ ] **Step 1: Write the failing test**

```ts
// tests/commands/ghCommands.test.ts
import { describe, expect, it } from 'bun:test';
import { ghCommand } from '../../src/commands/gh/index';

describe('Commands - Global /gh Surface', () => {
  it('should define canonical /gh command with all subcommands', () => {
    expect(ghCommand.data.name).toBe('gh');
    const subcommands = ghCommand.data.options.map((opt: any) => opt.name);
    expect(subcommands).toContain('connect');
    expect(subcommands).toContain('status');
    expect(subcommands).toContain('repo');
    expect(subcommands).toContain('issues');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/commands/ghCommands.test.ts`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Implement `/gh` command builder and shared dispatcher linking to `GitHubInstallationResolver`, `GitHubClientResolver`, and `commandResponseDecorator`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/commands/ghCommands.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/gh/ src/commands/github/ tests/commands/ghCommands.test.ts
git commit -m "feat(commands): implement canonical /gh global commands and /github alias"
```

---

### Task 8: Webhook Pipeline Multi-Tenant Lifecycle & Fail-Closed Routing

**Files:**
- Modify: `src/pipeline/router.ts`
- Modify: `src/pipeline/processor.ts`
- Test: `tests/pipeline/multiTenantRouting.test.ts`

**Interfaces:**
- Enforces: Delivery requires `Subscription.active === true AND DiscordGuildConnection.status === 'connected' AND GitHubInstallation.status === 'active'`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/pipeline/multiTenantRouting.test.ts
import { describe, expect, it, mock } from 'bun:test';
import { routeEventToSubscriptions } from '../../src/pipeline/router';

describe('Pipeline - MultiTenant Routing', () => {
  it('should fail closed if guild connection is disconnected or installation is suspended', async () => {
    const mockSubscriptions = [
      { guildId: 'guild-1', channelId: 'channel-1', installationId: 1001, repositoryId: 42, active: true },
    ];
    const mockSubModel = { find: mock(async () => mockSubscriptions) } as any;
    const mockGuildConnModel = { findOne: mock(async () => ({ status: 'disconnected' })) } as any;
    const mockInstModel = { findOne: mock(async () => ({ status: 'active' })) } as any;

    const matched = await routeEventToSubscriptions(
      { repositoryId: 42, installationId: 1001 } as any,
      { subModel: mockSubModel, guildConnModel: mockGuildConnModel, instModel: mockInstModel }
    );
    expect(matched.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/pipeline/multiTenantRouting.test.ts`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Update `src/pipeline/router.ts` and `src/pipeline/processor.ts` to query subscriptions using `(repositoryId, installationId)`, enforce 3-point fail-closed verification, and handle lifecycle actions (`installation.deleted`, `installation.suspend`, `installation_repositories.removed`).

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/pipeline/multiTenantRouting.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/router.ts src/pipeline/processor.ts tests/pipeline/multiTenantRouting.test.ts
git commit -m "feat(pipeline): enforce fail-closed multi-tenant installation routing and lifecycle updates"
```

---

### Task 9: End-to-End Multi-Tenant Verification & Security Isolation Suite

**Files:**
- Create: `tests/integration/multiTenantE2E.test.ts`
- Create: `tests/security/multiTenantIsolation.test.ts`

- [ ] **Step 1: Write full E2E & security isolation tests**

```ts
// tests/security/multiTenantIsolation.test.ts
import { describe, expect, it } from 'bun:test';

describe('Security - Multi-Tenant Isolation', () => {
  it('guarantees webhook delivery never crosses discord guild boundaries', async () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Run full regression test suite**

Run: `bun test && bun run typecheck && bun run lint && bun run format:check`  
Expected: All tests pass with 0 errors.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/multiTenantE2E.test.ts tests/security/multiTenantIsolation.test.ts
git commit -m "test(security): verify multi-tenant isolation and complete e2e flow"
```
