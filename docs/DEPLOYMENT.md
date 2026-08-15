# 🚀 OctoBot V1 - Production Deployment Guide

This guide details the operational requirements, topology, containerization, environment configuration, and verification procedures for deploying **OctoBot V1** to production.

---

## 🏛️ 1. Production Architecture & Topology

For V1 and initial pilots, OctoBot operates under a **single active replica** topology:

```text
┌───────────────────────────────────────────────────────────┐
│                      GitHub Cloud                         │
│  - Webhook delivery (HTTPS POST /api/webhooks/github)     │
│  - REST API reads (Live Octokit calls)                    │
└─────────────────────────────┬─────────────────────────────┘
                              │ HTTPS (TLS 1.2/1.3)
                              ▼
               ┌──────────────────────────────┐
               │    Reverse Proxy / Ingress   │
               │   (NGINX / Caddy / Cloud)    │
               └──────────────┬───────────────┘
                              │ HTTP
                              ▼
┌───────────────────────────────────────────────────────────┐
│              OctoBot Container (1 Replica)                │
│                                                           │
│  ├── Ingress & HMAC verification (verifyGithubWebhook)    │
│  ├── Idempotency Engine (X-GitHub-Delivery claim + lease)  │
│  ├── Pipeline Normalizer & Noise Policy Layer             │
│  ├── Discord Gateway Client (WebSocket connection)        │
│  └── Liveness (/health) & Readiness (/ready) Probes       │
└──────────────┬──────────────────────────────┬─────────────┘
               │                              │
       MongoDB Protocol               Discord Gateway WSS
               │                              │
               ▼                              ▼
┌──────────────────────────────┐ ┌──────────────────────────┐
│      MongoDB Database        │ │      Discord Cloud       │
│  - Subscriptions             │ │  - Guild Channels        │
│  - Webhook Deliveries (TTL)  │ │  - Slash Command API     │
│  - CI Workflow Alert State   │ └──────────────────────────┘
└──────────────────────────────┘
```

> [!IMPORTANT] > **Single Replica Constraint:** OctoBot maintains a persistent WebSocket connection to the Discord Gateway and registers slash command handlers. It is designed to run as **1 replica** for V1. Do not scale horizontally without sharded Discord gateway orchestration.

---

## ⚙️ 2. Environment Variables & Secrets Reference

All production secrets must be supplied via secure environment injection (e.g. AWS Secrets Manager, Doppler, Doppler, Kubernetes Secrets, or platform environment variables).

| Variable                | Type    | Required | Default      | Description                                                                          |
| :---------------------- | :------ | :------- | :----------- | :----------------------------------------------------------------------------------- |
| `PORT`                  | Integer | No       | `4000`       | Port for the Express HTTP server to bind.                                            |
| `NODE_ENV`              | String  | No       | `production` | Runtime environment mode (`production`, `development`, `test`).                      |
| `DISCORD_TOKEN`         | Secret  | **Yes**  | —            | Discord Bot Token from Developer Portal.                                             |
| `DISCORD_CLIENT_ID`     | String  | **Yes**  | —            | Discord Application ID for registering Slash Commands.                               |
| `DISCORD_GUILD_ID`      | String  | **Yes**  | —            | Primary Discord Server (Guild) ID.                                                   |
| `MONGODB_URI`           | Secret  | **Yes**  | —            | MongoDB connection string with credentials and authSource.                           |
| `GITHUB_TOKEN`          | Secret  | **Yes**  | —            | GitHub Personal Access Token (PAT) with `repo` / `admin:repo_hook` scopes.           |
| `GITHUB_OWNER`          | String  | **Yes**  | —            | Default GitHub organization or username owning the repositories.                     |
| `GITHUB_WEBHOOK_SECRET` | Secret  | **Yes**  | —            | Shared secret for verifying webhook HMAC SHA-256 signatures (`x-hub-signature-256`). |
| `API_URL`               | URL     | **Yes**  | —            | Publicly accessible HTTPS base URL (e.g. `https://octobot.yourdomain.com`).          |

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

GitHub requires webhooks targeting public endpoints to utilize valid SSL/TLS certificates.

### Public Endpoints Exposed:

- `POST /api/webhooks/github` (Webhook ingress with HMAC validation)
- `GET /health` (Liveness probe)
- `GET /ready` (Readiness probe)

### NGINX Sample Ingress Configuration:

```nginx
server {
    listen 443 ssl http2;
    server_name octobot.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/octobot.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/octobot.yourdomain.com/privkey.pem;

    location /api/webhooks/github {
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

---

## 🔄 7. Rollback & Emergency Procedures

1. **Service Rollback:** If a deployment fails health checks, revert the container image to the previous tagged stable release (`octobot:<previous-tag>`).
2. **Webhook Recovery:** Webhook deliveries during temporary downtime can be redelivered from GitHub's Webhook settings tab (_Recent Deliveries_ ➔ _Redeliver_). OctoBot's idempotency engine ensures no duplicates will be posted if deliveries were already processed.
