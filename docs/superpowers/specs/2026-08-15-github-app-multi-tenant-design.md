# Technical Design Spec: Multi-Tenant GitHub App Onboarding & `/gh` Surface

**Issue Reference:** [#32](https://github.com/sandovaldavid/octobot/issues/32)  
**Status:** Approved  
**Author:** Pair programming (sandovaldavid & Antigravity)  
**Date:** 2026-08-15  

---

## 1. Executive Summary & Goals

This specification formalizes the transition of OctoBot from a single-operator bot (utilizing personal access tokens and fixed guild IDs) into an installable multi-tenant Discord and GitHub App integration.

### Core Architectural Goals
1. **GitHub App Installation Authentication:** Eliminate long-lived `GITHUB_TOKEN` (PAT) as the primary operational model. Use short-lived installation access tokens generated dynamically on-demand via `@octokit/app`.
2. **Cryptographic Proof-of-Authorization Handshake with PKCE:** Secure onboarding via GitHub App Setup URL + OAuth PKCE verification (`code_challenge` / `code_verifier`) ensuring the candidate installation is accessible to the authenticated GitHub user.
3. **Decoupled Tenant & Credential Resolvers:** `GitHubInstallationResolver` maps Discord `guildId` to active installations; `GitHubClientResolver` generates and caches scoped `Octokit` instances.
4. **Canonical `/gh` Command Namespace:** Introduce global `/gh` commands with centralized policy-based authorization (`ManageGuild` vs Member) and progressive deprecation notices for `/github`.
5. **Fail-Closed Multi-Tenant Event Routing:** Route GitHub App webhook deliveries using `(installation.id, repository.id)` and enforce that delivery requires `Subscription.active = true AND DiscordGuildConnection.status = 'connected' AND GitHubInstallation.status = 'active'`.

---

## 2. System Architecture & Component Diagram

```text
                               ┌───────────────────────────────────────────────────────────┐
                               │                    OCTOBOT RUNTIME                        │
                               ├─────────────────────────────┬─────────────────────────────┤
                               │         DISCORD GATEWAY     │     EXPRESS HTTP SERVER     │
                               └──────────────┬──────────────┴──────────────┬──────────────┘
                                              │                             │
                        ┌─────────────────────┴──────┐        ┌─────────────┴─────────────┐
                        │   Discord Command Layer    │        │       Express Router      │
                        │ • /gh (canonical)          │        │ • GET  /api/github/setup  │
                        │ • /github (deprecated)     │        │ • GET  /api/github/callb. │
                        └─────────────┬──────────────┘        │ • POST /api/webhooks/gith.│
                                      │                       └─────────────┬─────────────┘
                        ┌─────────────▼──────────────┐                      │
                        │ CommandAuthorizationPolicy │        ┌─────────────▼─────────────┐
                        │ • ManageGuild vs Member    │        │ Setup & Webhook Pipelines │
                        └─────────────┬──────────────┘        │ • Nonce atomic verify     │
                                      │                       │ • PKCE OAuth proof check  │
                                      ▼                       │ • HMAC SHA-256 Pipeline   │
                        ┌────────────────────────────┐        └─────────────┬─────────────┘
                        │ GitHubInstallationResolver │                      │
                        │ (guildId ↔ installationId) │                      │
                        └─────────────┬──────────────┘                      │
                                      │                                     ▼
                                      │                       ┌───────────────────────────┐
                                      │                       │    GitHubClientResolver   │
                                      │                       │ (Octokit App Singleton)   │
                                      │                       └─────────────┬─────────────┘
                                      │                                     │
                                      └──────────────────┬──────────────────┘
                                                         │
                                               ┌─────────▼─────────┐
                                               │   MongoDB Models  │
                                               │ • ConnectionState │
                                               │ • GitHubInstall.  │
                                               │ • GuildConnection │
                                               │ • Subscriptions   │
                                               └───────────────────┘
```

---

## 3. Data Models (MongoDB)

### 3.1 `GitHubConnectionAttempt` (Ephemeral Handshake State with PKCE)
Stores the single-use cryptographic state for correlation between Discord interactions and the GitHub redirect flow.

```ts
export interface IGitHubConnectionAttempt {
  installStateHash: string; // SHA-256 of the 256-bit install nonce (Unique index)
  oauthStateHash?: string; // SHA-256 of the 256-bit oauth nonce (Sparse unique index)
  oauthCodeVerifier?: string; // Ephemeral PKCE code_verifier (never logged, TTL bounded)
  guildId: string; // Discord Guild Snowflake
  initiatedByDiscordUserId: string; // Admin initiating the connection
  candidateInstallationId?: number; // Captured from /setup before OAuth verification
  status: 'pending_setup' | 'pending_oauth' | 'verifying' | 'consumed' | 'failed';
  expiresAt: Date; // TTL Index (expires in 10 minutes)
  createdAt: Date;
  updatedAt: Date;
}
```

### 3.2 `GitHubInstallation` (GitHub App Installation Entity)
Represents the installation lifecycle state on GitHub independently of any Discord tenant mapping.

```ts
export interface IGitHubInstallation {
  installationId: number; // GitHub Installation ID (Unique index)
  accountId: number; // GitHub Organization or User ID
  accountLogin: string; // GitHub Organization or User Login (lowercase)
  accountType: 'Organization' | 'User';
  status: 'active' | 'suspended' | 'revoked';
  repositorySelection: 'all' | 'selected';
  permissions: Record<string, string>;
  events: string[];
  createdAt: Date;
  updatedAt: Date;
}
```

### 3.3 `DiscordGuildConnection` (Tenant Mapping Entity)
Represents the association between a Discord Guild and a GitHub Installation. Supports multiple installations per guild (compound unique index on `[guildId, installationId]`).

```ts
export interface IDiscordGuildConnection {
  guildId: string; // Discord Guild Snowflake (Index)
  installationId: number; // GitHub Installation ID (Index)
  status: 'connected' | 'disconnected';
  connectedByDiscordUserId: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### 3.4 `Subscription` (Repository Event Routing Entity)
Updated to store both `guildId` and `installationId` for atomic routing without cross-tenant leakage.

```ts
export interface ISubscription {
  repositoryId: number; // GitHub Repository ID
  repositoryFullName: string; // "owner/repo" (lowercase)
  installationId: number; // GitHub App Installation ID
  guildId: string; // Discord Guild Snowflake
  channelId: string; // Discord Channel Snowflake
  events: WebhookEventType[];
  active: boolean;
  createdByDiscordUserId: string;
  createdAt: Date;
  updatedAt: Date;
}
```

**Indexes for `Subscription`:**
- Compound Unique Index: `{ installationId: 1, repositoryId: 1, guildId: 1, channelId: 1 }` (prevents duplicate subscriptions per channel).
- Routing Index: `{ installationId: 1, repositoryId: 1, active: 1 }` (optimizes webhook dispatch).

---

## 4. Onboarding Protocol: Setup URL + Proof-of-Authorization (PKCE)

To prevent installation ID spoofing (GitHub Setup URL vulnerability where an attacker supplies an `installation_id` they do not own), OctoBot employs a hardened two-step handshake with PKCE and a transactional state machine:

```text
Discord (/gh connect)
   │
   │ 1. Generate 256-bit installNonce & save ConnectionAttempt (status: pending_setup, TTL: 10m)
   ▼
Ephemeral Link to GitHub App Install URL: https://github.com/apps/<app-name>/installations/new?state=<installNonce>
   │
   │ 2. Admin installs OctoBot on GitHub (Selects org/account and repositories)
   ▼
GET /api/github/setup?installation_id=123&state=<installNonce>
   │
   │ 3. Atomic verify: find & update ConnectionAttempt (status: pending_oauth, candidateInstallationId: 123)
   │ 4. Generate 256-bit oauthNonce, generate PKCE code_verifier + code_challenge (S256)
   │ 5. Save oauthStateHash and oauthCodeVerifier to attempt
   ▼
HTTP 302 Redirect to GitHub OAuth: https://github.com/login/oauth/authorize?client_id=...&state=<oauthNonce>&code_challenge=<challenge>&code_challenge_method=S256
   │
   │ 6. Admin authorizes proof-of-identity on GitHub
   ▼
GET /api/github/callback?code=<code>&state=<oauthNonce>
   │
   │ 7. Atomic claim: findOneAndUpdate({ oauthStateHash, status: 'pending_oauth' }, { status: 'verifying' })
   │ 8. Exchange code + oauthCodeVerifier for request-scoped user access token via GitHub OAuth API
   │ 9. Call GET /user/installations with user token to verify installation_id 123 is in accessible installations
   │ 10. Discard user access token immediately (request-scoped only, never persisted, cached, or logged)
   │ 11. Transactional state completion:
   │     - Upsert GitHubInstallation { installationId: 123, status: 'active', ... }
   │     - Upsert DiscordGuildConnection { guildId, installationId: 123, status: 'connected' }
   │     - Update ConnectionAttempt status: 'consumed'
   ▼
HTTP 200 Success Page: "OctoBot successfully connected to your Discord server! You can now use /gh repo watch."
```

---

## 5. Tenant & Credential Resolvers

### 5.1 Architectural Separation
```ts
export interface GitHubInstallationContext {
  installationId: number;
  accountId: number;
  accountLogin: string;
  status: 'active' | 'suspended' | 'revoked';
}

export interface IGitHubInstallationResolver {
  resolveForGuild(guildId: string, repositoryFullName?: string): Promise<GitHubInstallationContext>;
  listForGuild(guildId: string): Promise<GitHubInstallationContext[]>;
}

export interface IGitHubClientResolver {
  forInstallation(installationId: number): Promise<Octokit>;
  invalidate(installationId: number): void;
}
```

### 5.2 Client Lifecycle & Invalidation
- `GitHubClientResolver` maintains a singleton instance of `@octokit/app`.
- Scoped `Octokit` instances for each `installationId` are retrieved via `app.getInstallationOctokit(installationId)`.
- Internal memory cache is bounded (maximum 500 installations) with 1-hour idle eviction.
- Webhook lifecycle events (`installation.deleted`, `installation.suspend`) trigger immediate eviction from cache and update MongoDB status.

---

## 6. Command Surface & Authorization

### 6.1 Global Command Registration
- Registered as Global Application Commands with:
  - `contexts: [InteractionContextType.Guild]`
  - `integration_types: [ApplicationIntegrationType.GuildInstall]`

### 6.2 Permission Matrix (`CommandAuthorizationPolicy`)

| Command | Subcommand | Required Permission | Description |
| :--- | :--- | :--- | :--- |
| `/gh` | `connect` | `ManageGuild` / `Administrator` | Initiates onboarding handshake |
| `/gh` | `disconnect` | `ManageGuild` / `Administrator` | Disconnects an installation from guild |
| `/gh` | `status` | Any Guild Member | Displays bounded connection & subscription state |
| `/gh` | `repo watch` | `ManageGuild` / `Administrator` | Subscribes channel to repository events |
| `/gh` | `repo unwatch` | `ManageGuild` / `Administrator` | Removes repository subscription |
| `/gh` | `repo check` | Any Guild Member | Composite health check (installation, access, subscription, channel) |
| `/gh` | `issues list` | Any Guild Member | Lists open issues for a watched repository |
| `/github` | `*` (all) | *Identical to `/gh`* | Deprecated alias with `CommandResponseDecorator` |

### 6.3 Deprecation Decorator (`CommandResponseDecorator`)
When invoked through `/github`:
- Executes identical shared handler logic.
- Appends an informational notice in embed footer or message text:
  > *"💡 `/github` is deprecated and will be removed in a future major release. Use `/gh` instead."*

---

## 7. Webhook Pipeline & Lifecycle Events

### 7.1 Webhook Endpoint
- Standard machine-to-machine endpoint: `POST /api/webhooks/github` (unchanged from V1).
- Enforces HMAC SHA-256 signature verification (`X-Hub-Signature-256`) and delivery idempotency (`X-GitHub-Delivery`).

### 7.2 Lifecycle Event Handling
- `event: installation`:
  - `action: created` ➔ Upsert `GitHubInstallation` as `active`.
  - `action: deleted` ➔ Update `GitHubInstallation` to `revoked`, mark `DiscordGuildConnection` as `disconnected`, evict from client cache.
  - `action: suspend` ➔ Update `GitHubInstallation` to `suspended`, evict from client cache.
  - `action: unsuspend` ➔ Update `GitHubInstallation` to `active`.
- `event: installation_repositories`:
  - `action: added` ➔ Update `repositorySelection` metadata on `GitHubInstallation` (no repository list mirroring in DB).
  - `action: removed` ➔ Deactivate matching `Subscription`s and update `repositorySelection` metadata.
  - *Selection Semantics Reconciliation:* If `repository_selection` changes from `all` to `selected` (where `repositories_removed` may arrive empty), reconcile against GitHub API (`GET /installation/repositories`) to prune subscriptions for inaccessible repositories.

### 7.3 Fail-Closed Multi-Tenant Event Routing
- Webhook payload extracts `installation.id` and `repository.id`.
- Queries active subscriptions: `Subscription.find({ repositoryId, installationId, active: true })`.
- For each matched subscription, verifies:
  1. `Subscription.active === true`
  2. Matching `DiscordGuildConnection.status === 'connected'`
  3. Matching `GitHubInstallation.status === 'active'`
- Delivers Discord embeds strictly to the verified `guildId` and `channelId`, ensuring total tenant isolation and failing closed on suspended/disconnected states.

---

## 8. Domain Error Taxonomy & UX Mapping

```text
Domain Error                     HTTP/Discord UX Translation
─────────────────────────────────────────────────────────────────────────────
GuildNotConnectedError           "This Discord server is not connected to GitHub. Run /gh connect to link an installation."
InstallationSuspendedError       "The GitHub installation for this server is suspended on GitHub."
InstallationRevokedError         "The GitHub installation was uninstalled. Please reconnect using /gh connect."
RepositoryNotAccessibleError     "OctoBot does not have access to this repository under your GitHub App installation."
MissingCommandPermissionError    "You need 'Manage Server' permissions to configure OctoBot integrations."
HandshakeExpiredError            "Connection request expired or already consumed. Please run /gh connect again."
InstallationVerificationError    "The GitHub installation could not be verified for the authenticated GitHub user."
```

---

## 9. Environment & Secrets Specification

### 9.1 Canonical Multi-Tenant Configuration (Required in Production)
```env
# GitHub App Configuration
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your_webhook_hmac_secret
GITHUB_CLIENT_ID=Iv1.xxx
GITHUB_CLIENT_SECRET=your_oauth_client_secret

# Discord Configuration
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_discord_client_id

# Database & Server
MONGODB_URI=mongodb://localhost:27017/db-octobot
PORT=4000
NODE_ENV=production
API_URL=https://octobot.example.com
```

### 9.2 Legacy Compatibility Configuration (Deprecated in Minor, Removed in Major)
```env
# Single-Tenant PAT Mode (Deprecated)
GITHUB_TOKEN=ghp_xxx
GITHUB_OWNER=owner
GITHUB_REPO=repo
DISCORD_GUILD_ID=123456789012345678
DISCORD_CHANNEL_ID=123456789012345678
```

---

## 10. Governance & Release Strategy (SemVer)

- **Phase 1 (Next Minor Release):**
  - Canonical GitHub App authentication, Setup/OAuth handshake, resolvers, `/gh` command surface, and `/github` deprecation notice.
  - Legacy PAT mode supported with deprecation warnings.
- **Phase 2 (Next Deliberate Major Release):**
  - Breaking change removal of `/github` command namespace, legacy PAT mode, and legacy environment variables (`GITHUB_TOKEN`, `DISCORD_GUILD_ID`).
