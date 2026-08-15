# Technical Design Spec: Multi-Tenant GitHub App Onboarding & `/gh` Surface

**Issue Reference:** [#32](https://github.com/sandovaldavid/octobot/issues/32)  
**Status:** Approved  
**Author:** Pair programming (sandovaldavid & Antigravity)  
**Date:** 2026-08-15  

---

## 1. Executive Summary & Goals

This specification formalizes the transition of OctoBot from a single-operator bot (utilizing personal access tokens and fixed guild IDs) into an installable multi-tenant Discord and GitHub App integration.

### Core Architectural Goals
1. **GitHub App Installation Authentication:** Eliminate long-lived `GITHUB_TOKEN` (PAT) for operations. Use short-lived installation access tokens generated dynamically on-demand via `@octokit/app`.
2. **Cryptographic Proof-of-Authorization Handshake:** Secure onboarding via GitHub App Setup URL + ephemeral OAuth verification to prevent installation spoofing.
3. **Decoupled Tenant & Credential Resolvers:** `GitHubInstallationResolver` maps Discord `guildId` to active installations; `GitHubClientResolver` generates and caches scoped `Octokit` instances.
4. **Canonical `/gh` Command Namespace:** Introduce global `/gh` commands with centralized policy-based authorization (`ManageGuild` vs Member) and progressive deprecation notices for `/github`.
5. **Multi-Tenant Event Routing:** Route GitHub App webhook deliveries using `installation.id` + `repository.id` matching to isolate subscriptions across Discord guilds with zero cross-tenant leakage.

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
                                      │                       │ • User OAuth proof check  │
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

### 3.1 `GitHubConnectionAttempt` (Ephemeral Handshake State)
Stores the single-use cryptographic state for correlation between Discord interactions and the GitHub redirect flow.

```ts
export interface IGitHubConnectionAttempt {
  installStateHash: string; // SHA-256 of the 256-bit install nonce (Unique index)
  oauthStateHash?: string; // SHA-256 of the 256-bit oauth nonce (Sparse unique index)
  guildId: string; // Discord Guild Snowflake
  initiatedByDiscordUserId: string; // Admin initiating the connection
  candidateInstallationId?: number; // Captured from /setup before OAuth verification
  status: 'pending_setup' | 'pending_oauth' | 'consumed';
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

---

## 4. Onboarding Protocol: Setup URL + Proof-of-Authorization

To prevent installation ID spoofing (GitHub Setup URL vulnerability where an attacker can supply an `installation_id` they do not own), OctoBot employs a two-step handshake:

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
   │ 4. Generate 256-bit oauthNonce and save oauthStateHash
   ▼
HTTP 302 Redirect to GitHub OAuth: https://github.com/login/oauth/authorize?client_id=...&state=<oauthNonce>
   │
   │ 5. Admin authorizes proof-of-identity on GitHub
   ▼
GET /api/github/callback?code=<code>&state=<oauthNonce>
   │
   │ 6. Atomic verify oauthStateHash & consume attempt (status: consumed)
   │ 7. Exchange code for temporary user access token via GitHub OAuth API
   │ 8. Call GET /user/installations with user token to verify installation_id 123 is present in accessible installations
   │ 9. Discard user access token immediately (never stored in database/memory)
   │ 10. Atomic upsert:
   │     - GitHubInstallation { installationId: 123, status: 'active', ... }
   │     - DiscordGuildConnection { guildId, installationId: 123, status: 'connected' }
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
| `/gh` | `repo check` | Any Guild Member | Shows webhook & subscription health for repo |
| `/gh` | `issues list` | Any Guild Member | Lists open issues for a watched repository |
| `/gh` | `pulls list` | Any Guild Member | Lists open PRs for a watched repository |
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
  - `action: added` ➔ Update accessible repository lists.
  - `action: removed` ➔ Deactivate subscriptions for removed repositories.

### 7.3 Repository Event Routing
- Webhook payload extracts `installation.id` and `repository.id`.
- Queries active subscriptions: `Subscription.find({ repositoryId, installationId, active: true })`.
- Delivers Discord embeds strictly to the mapped `guildId` and `channelId`, ensuring total tenant isolation.

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
InstallationSpoofingError        "Installation verification failed: user is not an administrator of this GitHub installation."
```

---

## 9. Environment & Secrets Specification

### Operator Environment Variables
```env
# GitHub App Configuration
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your_webhook_hmac_secret
GITHUB_CLIENT_ID=Iv1.xxx
GITHUB_CLIENT_SECRET=your_oauth_client_secret

# Discord Configuration
DISCORD_TOKEN=your_bot_token
DISCORD_APPLICATION_ID=your_discord_app_id

# Database & Server
MONGODB_URI=mongodb://localhost:27017/db-octobot
PORT=4000
NODE_ENV=production
PUBLIC_URL=https://octobot.example.com
```

### Removed from Operator Runtime (Post-Migration)
- `GITHUB_TOKEN` (PAT eliminated)
- `GITHUB_OWNER`
- `GITHUB_REPO`
- `DISCORD_GUILD_ID`
- `DISCORD_CHANNEL_ID`

---

## 10. Governance & Release Strategy (SemVer)

- **Phase 1 (Next Minor Release):**
  - Implement GitHub App authentication, setup handshake, resolvers, `/gh` command surface, and `/github` deprecation notice.
  - Fully backward compatible with existing V1 deployments.
- **Phase 2 (Next Deliberate Major Release):**
  - Breaking change removal of `/github` command namespace and legacy single-tenant PAT fallback.
