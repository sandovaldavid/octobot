# 🤖 OctoBot — GitHub Workflow Assistant

<p align="right">
  <b>English</b> | <a href="README.es.md">Español</a>
</p>

[![Discord.js](https://img.shields.io/badge/discord.js-v14-blue.svg)](https://discord.js.org)
[![Bun](https://img.shields.io/badge/Bun-%3E%3D1.2.0-black.svg)](https://bun.sh)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13.1-brightgreen.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub App](https://img.shields.io/badge/GitHub-App-24292e.svg)](https://github.com/apps)
[![TypeScript](https://img.shields.io/badge/TypeScript-5%2F6-blue.svg)](https://www.typescriptlang.org)

> Event-driven, multi-tenant Discord assistant for engineering teams. Delivers real-time GitHub events (pull requests, CI/CD workflow runs, issues, commits, branches, releases) to authorized Discord channels with fail-closed tenant isolation, HMAC cryptographic verification, and idempotent delivery—keeping **GitHub as the single source of truth**.

---

## 📋 Table of Contents

- [Purpose & Architecture Boundaries](#-purpose--architecture-boundaries)
- [Multi-Tenant Architecture & Data Flow](#-multi-tenant-architecture--data-flow)
- [MongoDB Persistence Model](#-mongodb-persistence-model)
- [Security Boundaries & Authentication](#-security-boundaries--authentication)
- [Discord Commands (Global `/gh`)](#-discord-commands-global-gh)
- [Public HTTP Surface](#-public-http-surface)
- [Prerequisites](#-prerequisites)
- [Installation & Quickstart](#-installation--quickstart)
- [Environment Configuration](#-environment-configuration)
- [Docker & Production Deployment](#-docker--production-deployment)
- [Available Scripts](#-available-scripts)
- [Automated Testing](#-automated-testing)
- [License](#-license)

---

## 🎯 Purpose & Architecture Boundaries

OctoBot is built as a secure, focused, and production-grade **GitHub Workflow Assistant** for multi-organization engineering environments:

- 🔔 **Event-Driven Delivery:** Ingests cryptographically signed GitHub App webhooks and routes rich, actionable Discord embeds to subscribed channels in real time.
- 🏢 **Strict Multi-Tenancy:** A single runtime instance safely serves multiple independent Discord servers (guilds) linked to multiple GitHub App installations (organizations or user accounts) without cross-tenant data leakage.
- 📖 **GitHub as Single Source of Truth:** Zero database content replication. Repositories, pull requests, issues, and commit histories are never mirrored or persisted in MongoDB.
- 🛡️ **Minimal HTTP Attack Surface:** Exposes strictly what is necessary: webhook ingress (`/api/webhooks/github`), the onboarding handshake (`/api/github/setup`, `/api/github/callback`), and liveness/readiness probes (`/health`, `/ready`). Repository administration or issue querying is never exposed over HTTP.
- 🔒 **Fail-Closed Subscription Routing:** Webhook event delivery strictly verifies a 3-point check before dispatch: active channel subscription, verified guild connection, and active GitHub installation status.
- 🔕 **Intelligent Noise Reduction:** Suppresses non-actionable notification noise (e.g. `synchronize` pushes on open pull requests, repeated CI failures for the same workflow run/attempt), while ensuring actionable transitions (first CI failure, CI recovery, PR approvals, merge readiness) are immediately delivered.
- 🔐 **Role-Based Access Control (RBAC):** Mutation commands (`connect`, `disconnect`, `watch`, `unwatch`) require `Administrator` or `Manage Server` (`ManageGuild`) permissions in Discord. Read-only commands (`status`, `check`, `issues list`) are available to all server members.

---

## 🏛️ Multi-Tenant Architecture & Data Flow

```mermaid
graph TD
    subgraph GitHub ["GitHub Cloud"]
        GH_App["GitHub App Webhooks"]
        GH_OAuth["OAuth 2.0 PKCE Handshake"]
        GH_API["Installation REST API (Octokit)"]
    end

    subgraph OctoBot ["OctoBot Runtime"]
        Ingress["Express Ingress: /api/webhooks/github"]
        HMAC["HMAC SHA-256 Verification (verifyGithubWebhook)"]
        Idempotency["DeliveryIdempotencyService (Atomic Claims)"]
        Onboard["Onboarding Controller: /setup & /callback"]
        Router["Fail-Closed Subscription Router"]
        DiscordClient["Discord Bot Client (Gateway WSS)"]
        ClientResolver["GitHubClientResolver (LRU / Idle Eviction)"]
    end

    subgraph Storage ["MongoDB: Operational State Only"]
        Insts[("GitHubInstallations")]
        Conns[("DiscordGuildConnections")]
        Subs[("Subscriptions")]
        Attempts[("GitHubConnectionAttempts (TTL: 10m)")]
        Deliveries[("WebhookDeliveries (Lease: 60s, TTL: 7d)")]
        AlertState[("WorkflowAlertState (CI Health)")]
    end

    GH_App -->|"POST rawBody + x-hub-signature-256"| Ingress
    Ingress --> HMAC
    HMAC --> Idempotency
    Idempotency -->|"Atomic claim via X-GitHub-Delivery"| Deliveries
    Idempotency --> Router
    Router -->|"1. Verify active connection"| Conns
    Router -->|"2. Verify active installation"| Insts
    Router -->|"3. Match channel subscriptions"| Subs
    Router -->|"4. Check workflow state / noise policy"| AlertState
    Router -->|"Dispatch rich embed"| DiscordClient
    DiscordClient -->|"Notification"| DiscordChannel["Discord Channel"]

    DiscordAdmin["Discord Admin"] -->|"/gh connect"| DiscordClient
    DiscordClient -->|"Generate hashed nonce & PKCE challenge"| Onboard
    Onboard -->|"Record ephemeral attempt (10m TTL)"| Attempts
    Onboard -->|"OAuth 2.0 exchange & permission check"| GH_OAuth
    Onboard -->|"Upsert verified link"| Conns
    Onboard -->|"Upsert installation metadata"| Insts

    DiscordUser["Discord Member"] -->|"/gh issues list"| DiscordClient
    DiscordClient --> ClientResolver
    ClientResolver -->|"Installation-scoped Octokit client"| GH_API
```

---

## 🗄️ MongoDB Persistence Model

MongoDB stores **only operational, relation, and idempotency state owned by OctoBot**. Repository code, issue descriptions, PR diffs, and commit records are never stored.

| Model                                     | Primary Keys / Indexes                                                                                                                              | Lifecycle / TTL                                        | Stored Attributes                                                                                                                                                                                                    |
| :---------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GitHubInstallation`                      | `installationId` (unique), `accountLogin`                                                                                                           | Persistent (updated via webhooks / onboarding)         | `installationId`, `accountId`, `accountLogin`, `accountType` (`Organization` \| `User`), `status` (`active` \| `suspended` \| `revoked`), `repositorySelection` (`all` \| `selected`), `permissions`, `events`.      |
| `DiscordGuildConnection`                  | Compound unique: `{ guildId: 1, installationId: 1 }`                                                                                                | Persistent                                             | `guildId`, `installationId`, `status` (`connected` \| `disconnected`), `connectedByDiscordUserId`.                                                                                                                   |
| `GitHubConnectionAttempt`                 | `installStateHash` (unique), `oauthStateHash` (unique, sparse)                                                                                      | **TTL: 10 minutes** (`expireAfterSeconds: 0`)          | `installStateHash`, `oauthStateHash`, `oauthCodeVerifier`, `guildId`, `initiatedByDiscordUserId`, `candidateInstallationId`, `status` (`pending_setup` \| `pending_oauth` \| `verifying` \| `consumed` \| `failed`). |
| `Subscription` (`RepositorySubscription`) | Compound unique: `{ installationId: 1, repositoryId: 1, guildId: 1, channelId: 1 }`<br>Routing: `{ installationId: 1, repositoryId: 1, active: 1 }` | Persistent                                             | `installationId`, `repositoryId`, `repositoryFullName`, `guildId`, `channelId`, `events` (`WebhookEventType[]`), `active` (boolean), `createdByDiscordUserId`.                                                       |
| `WebhookDelivery`                         | `deliveryId` (unique from `X-GitHub-Delivery`)                                                                                                      | **Lease: 60 seconds**<br>**TTL: 7 days** (`expiresAt`) | `deliveryId`, `eventName`, `status` (`processing` \| `completed` \| `rejected` \| `retryable_failed`), `attemptCount`, `leaseExpiresAt`, `completedAt`, `finalOutcome`, `responseStatus`, `expiresAt`.               |
| `WorkflowAlertState`                      | Compound unique: `{ repositoryFullName: 1, workflowId: 1, headBranch: 1 }`                                                                          | Persistent                                             | `repositoryFullName`, `workflowId`, `headBranch`, `state` (`healthy` \| `failing`), `lastRunId`, `lastRunNumber`, `lastRunAttempt`, `lastFailureRunId`, `lastFailureAt`.                                             |

---

## 🔒 Security Boundaries & Authentication

### 1. Webhook Signature Verification (HMAC-SHA256)

- Webhooks received at `POST /api/webhooks/github` are verified against `GITHUB_WEBHOOK_SECRET` before parsing or handling.
- Verification operates directly on `req.rawBody` (unparsed `Buffer`) using `crypto.createHmac('sha256', secret)`.
- Hashes are compared with constant-time equality via `crypto.timingSafeEqual` to prevent timing side-channel attacks.
- Requests with missing headers (`x-github-event`, `x-github-delivery`, `x-hub-signature-256`) or invalid signatures immediately terminate with `400` or `401`.

### 2. Proof-of-Association Onboarding Handshake (OAuth 2.0 with PKCE)

- Running `/gh connect` in a Discord server creates an ephemeral `GitHubConnectionAttempt` record storing a SHA-256 hashed setup nonce with a 10-minute expiration.
- In `/api/github/setup`, OctoBot generates a cryptographically random PKCE `code_verifier` and derived `code_challenge` (S256), binding them to an OAuth nonce before redirecting the user to GitHub.
- In `/api/github/callback`, OctoBot verifies the state hash, exchanges the authorization code with GitHub using the verifier, and queries GitHub's `/user/installations` API using the user's access token.
- OctoBot verifies that the authenticating GitHub user actually has administrative access to the target `installationId` before creating or updating the `DiscordGuildConnection`.

### 3. Webhook Delivery Idempotency & Replay Protection

- Every inbound webhook is guarded by its `X-GitHub-Delivery` GUID in `DeliveryIdempotencyService`.
- An atomic insert (`status: 'processing'`, 60s lease) claims the delivery. If duplicate deliveries arrive concurrently or via manual GitHub redelivery:
    - Completed deliveries (`status: 'completed'`) return `200 OK` with `ignored_duplicate`.
    - In-flight deliveries within their active lease return `202 Accepted` with `ignored_duplicate_in_flight`.
    - Expired leases are atomically reclaimed to prevent deadlocks from unhandled worker crashes.

### 4. Discord Command Permissions (RBAC)

- Enforced at dispatcher entry point via `verifyCommandAuthorization`:
    - **Mutation commands** (`/gh connect`, `/gh disconnect`, `/gh repo watch`, `/gh repo unwatch`) require `Administrator` or `Manage Server` (`ManageGuild`) permissions. Unauthorized invocations are rejected with an ephemeral error.
    - **Query commands** (`/gh status`, `/gh repo check`, `/gh issues list`) are accessible to all guild members.

---

## 💬 Discord Commands (Global `/gh`)

The primary command interface is registered globally under `/gh`:

| Command Group | Command            | Options / Parameters                                                                | Permission Required               | Description                                                                                      |
| :------------ | :----------------- | :---------------------------------------------------------------------------------- | :-------------------------------- | :----------------------------------------------------------------------------------------------- |
| —             | `/gh connect`      | —                                                                                   | `Administrator` / `Manage Server` | Initiates the secure GitHub App linking flow using PKCE verification.                            |
| —             | `/gh disconnect`   | `installation_id` _(optional)_                                                      | `Administrator` / `Manage Server` | Unlinks a GitHub installation from this Discord server.                                          |
| —             | `/gh status`       | —                                                                                   | Everyone (Guild Member)           | Displays connected GitHub organizations, installation states, and subscribed channels.           |
| `repo`        | `/gh repo watch`   | `name:<owner/repo>` _(required)_<br>`events:<list>` _(optional)_                    | `Administrator` / `Manage Server` | Subscribes the current channel to events for the target repository.                              |
| `repo`        | `/gh repo unwatch` | `name:<owner/repo>` _(required)_                                                    | `Administrator` / `Manage Server` | Removes repository event subscriptions from the current channel.                                 |
| `repo`        | `/gh repo check`   | `name:<owner/repo>` _(required)_                                                    | Everyone (Guild Member)           | Runs a composite health check on repository connectivity, installation, and subscription status. |
| `issues`      | `/gh issues list`  | `repo:<owner/repo>` _(required)_<br>`state:[open\|closed\|all]`<br>`limit:<number>` | Everyone (Guild Member)           | Dynamically queries live issues via installation-scoped Octokit without database mirroring.      |

> [!NOTE]
> The legacy `/github` namespace is retained as a backward-compatible alias. In GitHub App mode, it appends a deprecation notice directing users to `/gh`. In `legacy_pat` mode, it routes to legacy handlers.

---

## 🌐 Public HTTP Surface

OctoBot exposes a strictly bounded public HTTP surface:

| Method | Endpoint               | Purpose                                                                                | Security & Authentication                                                          |
| :----- | :--------------------- | :------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------- |
| `POST` | `/api/webhooks/github` | Ingress for GitHub App event deliveries.                                               | HMAC SHA-256 signature (`x-hub-signature-256`) + atomic idempotency claim.         |
| `GET`  | `/api/github/setup`    | Post-installation redirect from GitHub App install flow.                               | Cryptographic state nonce validation; issues PKCE challenge.                       |
| `GET`  | `/api/github/callback` | OAuth 2.0 PKCE callback endpoint.                                                      | Validates state hash, exchanges code via PKCE verifier, checks user membership.    |
| `GET`  | `/health`              | **Liveness Probe**: Confirms HTTP process uptime and connectivity indicators.          | Public; outputs uptime, Discord status, webhook configuration, and DB status.      |
| `GET`  | `/ready`               | **Readiness Probe**: Confirms both Discord Gateway and MongoDB connections are active. | Public; returns `200 READY` if both subsystems are up, or `503 UNREADY` otherwise. |

> [!IMPORTANT]
> Administrative repository mutations, issue tracking, and webhook simulations are intentionally not exposed over HTTP. All requests to unmounted paths return `404 Not Found`.

---

## 📋 Prerequisites

- [Bun](https://bun.sh) `>=1.2.0` _(recommended)_ or [Node.js](https://nodejs.org) `>=22.13.1`
- [MongoDB](https://www.mongodb.com) 6.0+ (standalone instance, replica set, or via Docker Compose)
- A registered **Discord Application & Bot** with Bot Token and Client ID from the [Discord Developer Portal](https://discord.com/developers/applications)
- A configured **GitHub App** with:
    - **Repository Permissions:**
        - Issues: Read-only
        - Pull requests: Read-only
        - Actions / Workflows: Read-only
        - Contents / Commits: Read-only
        - Metadata: Read-only
    - **Subscribe to Events:** `issues`, `pull_request`, `push`, `release`, `workflow_run`, `installation`, `installation_repositories`
    - **Webhook URL:** `https://your-public-url.example/api/webhooks/github`
    - **Setup URL (Redirect):** `https://your-public-url.example/api/github/setup`
    - **Callback URL:** `https://your-public-url.example/api/github/callback`
    - **Webhook Secret** and generated **RSA Private Key** (.pem)

---

## 🚀 Installation & Quickstart

1. **Clone the repository:**

    ```bash
    git clone https://github.com/sandovaldavid/octobot.git
    cd octobot
    ```

2. **Install dependencies:**

    ```bash
    bun install
    ```

3. **Configure environment variables:**

    ```bash
    cp .env.example .env
    ```

4. **Start local database (Docker Compose):**

    ```bash
    docker compose -f docker-compose.development.yml up -d
    ```

5. **Start the development server (with hot reload):**
    ```bash
    bun run dev
    ```

---

## ⚙️ Environment Configuration

Canonical configuration for **GitHub App Mode** in `.env`:

```env
# Server & Runtime
PORT=4000
NODE_ENV=production

# Discord Configuration
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id

# Public URL (must match GitHub App configuration)
API_URL=https://octobot.yourdomain.com

# MongoDB Persistence
MONGODB_URI=mongodb://user:password@localhost:27017/octobot?authSource=admin

# GitHub App Credentials
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your_webhook_secret_key
GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret
GITHUB_APP_SLUG=octobot
```

---

## 🐳 Docker & Production Deployment

### Build and Run with Docker

```bash
# Build the production Docker image
docker build -t octobot:1.0.0 -f Dockerfile .

# Run the container with environment variables
docker run -d \
  --name octobot \
  --restart unless-stopped \
  -p 4000:4000 \
  --env-file .env \
  octobot:1.0.0
```

> [!IMPORTANT]
> **Single Replica Constraint:** OctoBot maintains a persistent WebSocket connection to the Discord Gateway and manages slash command interactions. Deploy as **1 replica** unless utilizing an external Discord gateway proxy or sharded clustering.

For complete production architecture, ingress, and operational verification, consult:

- 📖 **[Production Deployment Guide (`docs/DEPLOYMENT.md`)](docs/DEPLOYMENT.md)**
- 🧪 **[Pilot Onboarding & Verification Matrix (`docs/PILOT.md`)](docs/PILOT.md)**

---

## 📜 Available Scripts

| Script         | Command                | Purpose                                                             |
| :------------- | :--------------------- | :------------------------------------------------------------------ |
| `dev`          | `bun run dev`          | Runs the bot locally with Bun hot reloading (`--hot src/index.ts`). |
| `start`        | `bun run start`        | Runs the entrypoint in standard execution mode.                     |
| `build`        | `bun run build`        | Compiles a production bundle to `./dist` targeting Node.js.         |
| `test`         | `bun test`             | Executes the complete unit, integration, and security test suite.   |
| `typecheck`    | `bun run typecheck`    | Validates static TypeScript typing (`tsc --noEmit`).                |
| `lint`         | `bun run lint`         | Lints codebase using ESLint 9 flat configuration.                   |
| `lint:fix`     | `bun run lint:fix`     | Lints and automatically resolves fixable styling issues.            |
| `format:check` | `bun run format:check` | Checks formatting across the workspace using Prettier.              |
| `format`       | `bun run format`       | Auto-formats code and markdown files with Prettier.                 |

---

## 🧪 Automated Testing

OctoBot maintains comprehensive automated test coverage across domain logic, security constraints, and integration paths:

```bash
bun test
```

### Test Coverage Highlights

- **238 passed tests** across 28 test suites in ~3.2 seconds.
- **Security Surface Tests (`tests/security/`):** Verifies that non-whitelisted HTTP paths (e.g. `/api/repositories`, `/api/issues`) return `404`, and verifies HMAC validation and multi-tenant isolation.
- **Idempotency Engine Tests (`tests/services/deliveryIdempotencyService.test.ts`):** Tests atomic lease claims, race conditions, expired lease reclaims, and duplicate suppressions.
- **Onboarding Handshake Tests (`tests/controllers/githubOnboardingController.test.ts`):** Tests setup nonce creation, PKCE exchange, expired session handling, and user permission verification.
- **Multi-Tenant Routing Tests (`tests/pipeline/multiTenantRouting.test.ts`):** Verifies fail-closed checks across tenant connections, suspended installations, and channel subscription matching.
- **Discord Policy Tests (`tests/services/discord/commandPolicy.test.ts`):** Tests RBAC enforcement for administrative subcommands.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
