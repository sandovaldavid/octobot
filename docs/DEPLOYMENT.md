# 🚀 OctoBot - Production Deployment Guide

This guide details the operational requirements, topology, containerization, environment configuration, and verification procedures for deploying **OctoBot** in production.

---

## 🏛️ 1. Production Architecture & Topology

OctoBot operates as a **multi-tenant GitHub App assistant** with a single active service replica:

```text
┌───────────────────────────────────────────────────────────┐
│                      GitHub Cloud                         │
│  - Webhook delivery (HTTPS POST /api/webhooks/github)     │
│  - App OAuth & Setup (GET /api/github/setup & /callback)  │
│  - App Installation REST API (Installation-scoped Octokit)│
└─────────────────────────────┬─────────────────────────────┘
                              │ HTTPS (TLS 1.2/1.3)
                              ▼
               ┌──────────────────────────────┐
               │    Reverse Proxy / Ingress   │
               │   (NGINX / Caddy / Cloudflare│
               └──────────────┬───────────────┘
                              │ HTTP
                              ▼
┌───────────────────────────────────────────────────────────┐
│              OctoBot Container (1 Replica)                │
│                                                           │
│  ├── Ingress & HMAC verification (verifyGithubWebhook)    │
│  ├── Onboarding Handshake & PKCE (githubOnboarding)       │
│  ├── Idempotency Engine (X-GitHub-Delivery claim + lease) │
│  ├── Multi-Tenant Subscription Router (Fail-closed)       │
│  ├── Discord Gateway Client (WebSocket connection)        │
│  └── Liveness (/health) & Readiness (/ready) Probes       │
└──────────────┬──────────────────────────────┬─────────────┘
               │                              │
       MongoDB Protocol               Discord Gateway WSS
               │                              │
               ▼                              ▼
┌──────────────────────────────┐ ┌──────────────────────────┐
│      MongoDB Database        │ │      Discord Cloud       │
│  - GitHub Installations      │ │  - Guild Channels        │
│  - Guild Connections         │ │  - Global /gh Commands   │
│  - Repository Subscriptions  │ └──────────────────────────┘
│  - Webhook Deliveries (TTL)  │
│  - CI Workflow Alert State   │
└──────────────────────────────┘
```

> [!IMPORTANT]
> **Single Replica Constraint:** OctoBot maintains a persistent WebSocket connection to the Discord Gateway and registers slash command handlers. It is designed to run as **1 replica**. Do not scale horizontally without sharded Discord gateway orchestration.

---

## ⚙️ 2. Environment Variables & Secrets Reference

### A. Canonical GitHub App Mode (Recommended)

| Variable                 | Type    | Required | Default       | Description                                                                          |
| :----------------------- | :------ | :------- | :------------ | :----------------------------------------------------------------------------------- |
| `PORT`                   | Integer | No       | `4000`        | Port for the Express HTTP server to bind.                                            |
| `NODE_ENV`               | String  | No       | `production`  | Runtime environment mode (`production`, `development`, `test`).                      |
| `DISCORD_TOKEN`          | Secret  | **Yes**  | —             | Discord Bot Token from Developer Portal.                                             |
| `DISCORD_CLIENT_ID`      | String  | **Yes**  | —             | Discord Application ID for registering global `/gh` commands.                        |
| `API_URL`                | URL     | **Yes**  | —             | Publicly accessible HTTPS base URL (e.g. `https://octobot.yourdomain.com`).          |
| `MONGODB_URI`            | Secret  | **Yes**  | —             | MongoDB connection string with credentials and authSource.                           |
| `GITHUB_APP_ID`          | Integer | **Yes**  | —             | Numeric GitHub App ID from GitHub Developer settings.                                |
| `GITHUB_APP_PRIVATE_KEY` | Secret  | **Yes**  | —             | RSA Private Key in PEM format (newline escaped or multiline).                        |
| `GITHUB_WEBHOOK_SECRET`  | Secret  | **Yes**  | —             | Shared secret for verifying webhook HMAC SHA-256 signatures (`x-hub-signature-256`). |
| `GITHUB_CLIENT_ID`       | String  | **Yes**  | —             | GitHub OAuth Client ID for PKCE onboarding proof-of-association.                     |
| `GITHUB_CLIENT_SECRET`   | Secret  | **Yes**  | —             | GitHub OAuth Client Secret for code exchange.                                        |
| `GITHUB_APP_SLUG`        | String  | No       | `octobot-app` | Public URL slug for the GitHub App.                                                  |

### B. Legacy Single-Tenant PAT Mode (Deprecated)

> [!WARNING]
> Legacy PAT mode is deprecated and maintained for backward compatibility. It requires `GITHUB_TOKEN`, `GITHUB_OWNER`, and `DISCORD_GUILD_ID`.

---

## 🐳 3. Container Deployment (Docker)

### Build Image

```bash
docker build -t octobot:1.0.0 -f Dockerfile .
```

### Run Container

```bash
docker run -d \
  --name octobot \
  --restart unless-stopped \
  -p 4000:4000 \
  --env-file /path/to/secure/production.env \
  octobot:1.0.0
```

---

## 🛡️ 4. Reverse Proxy & HTTPS Networking

GitHub requires webhooks and OAuth redirects targeting public endpoints to utilize valid SSL/TLS certificates.

### Public Endpoints Exposed:

- `POST /api/webhooks/github` (Webhook ingress with HMAC validation)
- `GET /api/github/setup` (Onboarding installation redirection)
- `GET /api/github/callback` (OAuth authorization callback and proof-of-association verification)
- `GET /health` (Liveness probe)
- `GET /ready` (Readiness probe)

### NGINX Sample Ingress Configuration:

```nginx
server {
    listen 443 ssl http2;
    server_name octobot.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/octobot.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/octobot.yourdomain.com/privkey.pem;

    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health {
        proxy_pass http://127.0.0.1:4000;
    }

    location /ready {
        proxy_pass http://127.0.0.1:4000;
    }
}
```

---

## 🔍 5. Liveness, Readiness & Health Checks

| Endpoint      | Purpose                                                                  | HTTP 200                                                                 | HTTP 503                                     |
| :------------ | :----------------------------------------------------------------------- | :----------------------------------------------------------------------- | :------------------------------------------- |
| `GET /health` | **Liveness Probe**: Confirms HTTP process is up.                         | `{ "status": "OK", "uptime": 1234 }`                                     | —                                            |
| `GET /ready`  | **Readiness Probe**: Confirms Discord Gateway and MongoDB are connected. | `{ "status": "READY", "checks": { "discord": "UP", "database": "UP" } }` | `{ "status": "UNREADY", "checks": { ... } }` |

---

## 🛑 6. Graceful Shutdown & Lifecycle

OctoBot handles `SIGTERM` and `SIGINT` signals:

1. Stops accepting new inbound HTTP requests (`server.close()`).
2. Disconnects from the Discord Gateway WebSocket (`client.destroy()`).
3. Closes active MongoDB connections cleanly (`mongoose.connection.close()`).
4. Exits with status code `0`.
