# 🤖 OctoBot - GitHub Workflow Assistant

[![Discord.js](https://img.shields.io/badge/discord.js-v14-blue.svg)](https://discord.js.org)
[![Bun](https://img.shields.io/badge/Bun-%3E%3D1.2.0-black.svg)](https://bun.sh)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13.1-brightgreen.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> Asistente de Discord multi-tenant orientado a eventos para equipos de ingeniería. Notifica en tiempo real eventos de GitHub (commits, pull requests, issues, releases, ramas y workflows de CI) hacia canales autorizados de Discord, manteniendo a **GitHub como la única fuente de la verdad**.

---

## 📋 Tabla de Contenidos

- [Propósito y Límites](#-propósito-y-límites)
- [Arquitectura y Persistencia Multi-Tenant](#-arquitectura-y-persistencia-multi-tenant)
- [Límites de Seguridad y Permisos](#-límites-de-seguridad-y-permisos)
- [Requisitos](#-requisitos)
- [Instalación y Configuración](#-instalación-y-configuración)
- [Comandos de Discord (Slash Commands)](#-comandos-de-discord-slash-commands)
- [Superficie HTTP](#-superficie-http)
- [Docker y Base de Datos](#-docker-y-base-de-datos)
- [Scripts Disponibles](#-scripts-disponibles)
- [Pruebas Automatizadas](#-pruebas-automatizadas)
- [Licencia](#-licencia)

---

## 🎯 Propósito y Límites

OctoBot está diseñado como un **GitHub Workflow Assistant** enfocado, multi-tenant y seguro:

- 🔔 **Event-driven:** Reacciona a webhooks firmados de GitHub App y los canaliza hacia los canales suscritos de Discord.
- 🏢 **Multi-Tenant:** Soporta múltiples servidores de Discord y múltiples organizaciones/cuentas de GitHub aisladas de forma estricta.
- 📖 **GitHub como Source of Truth:** No replica repositorios, issues ni commits en base de datos.
- 🛡️ **Superficie HTTP Mínima:** Expone únicamente el receptor de webhooks (`/api/webhooks/github`), el handshake de onboarding (`/api/github/setup`, `/api/github/callback`) y sondas de salud (`/health`, `/ready`).
- 🔐 **Control de Acceso:** La gestión de suscripciones se realiza exclusivamente mediante Slash Commands globales `/gh` protegidos por permisos de servidor (`Administrator` / `ManageGuild`).

---

## 🏛️ Arquitectura y Persistencia Multi-Tenant

```mermaid
graph TD
    subgraph GitHub [GitHub Cloud]
        GH_App[GitHub App Webhooks]
        GH_OAuth[OAuth 2.0 PKCE]
        GH_API[Installation REST API]
    end

    subgraph OctoBot [OctoBot Runtime]
        Ingress[Express Ingress: /api/webhooks/github]
        HMAC[verifyGithubWebhook Middleware]
        Onboard[Onboarding Controller: /setup & /callback]
        Router[Fail-Closed Subscription Router]
        DiscordClient[Discord Bot Client]
        ClientResolver[GitHubClientResolver]
    end

    subgraph Storage [MongoDB: Operational State Only]
        Insts[(GitHubInstallations)]
        Conns[(DiscordGuildConnections)]
        Subs[(Subscriptions)]
        Attempts[(GitHubConnectionAttempts - TTL)]
        Deliveries[(WebhookDeliveries - TTL)]
    end

    GH_App -->|POST rawBody + x-hub-signature-256| Ingress
    Ingress --> HMAC
    HMAC --> Router
    Router -->|Verify Tenant Connection| Conns
    Router -->|Verify Installation Status| Insts
    Router -->|Match Channel Subscriptions| Subs
    Router -->|Dispatch Notification Embed| DiscordClient
    DiscordClient -->|Alerts| DiscordChannel[Discord Channel]

    DiscordAdmin[Discord Admin] -->|/gh connect| DiscordClient
    DiscordClient -->|Generate Signed Nonce| Onboard
    Onboard -->|PKCE Exchange & Verify Association| GH_OAuth
    Onboard -->|Upsert Tenant Link| Conns
    Onboard -->|Upsert Installation| Insts

    DiscordUser[Discord User] -->|/gh issues list| DiscordClient
    DiscordClient --> ClientResolver
    ClientResolver -->|Installation-scoped client| GH_API
```

### Datos Persistidos en MongoDB

MongoDB almacena **únicamente datos operativos y de relación tenant propiedad de OctoBot**:

- `GitHubInstallation`: Metadatos de la instalación de GitHub App (`installationId`, `accountId`, `accountLogin`, `accountType`, `status: active|suspended|revoked`, `repositorySelection`).
- `DiscordGuildConnection`: Vinculación compuesta `[guildId, installationId]` con estado `connected|disconnected`.
- `GitHubConnectionAttempt`: Registro efímero con TTL de 10 minutos para nonces y desafío PKCE contra ataques de replay y CSRF.
- `Subscription`: Suscripciones por canal `[installationId, repositoryId, guildId, channelId]`.
- `WorkflowAlertState`: Seguimiento compuesto de salud de CI (`healthy` | `failing`) con deduplicación por run/attempt.
- `WebhookDelivery`: Registro de idempotencia por `deliveryId` (`X-GitHub-Delivery`) con lease atómico de 60s y TTL de 7 días.

---

## 🔒 Límites de Seguridad y Permisos

### Permisos de Discord

- Comandos de mutación (`/gh connect`, `/gh disconnect`, `/gh repo watch`, `/gh repo unwatch`) requieren permisos de **Administrator** o **Manage Server** (`ManageGuild`).
- Comandos de consulta (`/gh status`, `/gh repo check`, `/gh issues list`) son de solo lectura y están disponibles para todos los miembros del servidor.

---

## 📋 Requisitos

- [Bun](https://bun.sh) `>=1.2.0` o [Node.js](https://nodejs.org) `>=22.13.1`
- Docker y Docker Compose para MongoDB
- Bot de Discord registrado en [Discord Developer Portal](https://discord.com/developers/applications)
- GitHub App configurada con permisos de Repository (Issues, Pull requests, Actions) y Webhooks.

---

## 🚀 Instalación y Configuración

1. **Clonar el repositorio:**

    ```bash
    git clone https://github.com/sandovaldavid/octobot.git
    cd octobot
    ```

2. **Instalar dependencias:**

    ```bash
    bun install
    ```

3. **Configurar variables de entorno:**

    ```bash
    cp .env.example .env
    ```

4. **Variables en `.env` (Modo Canónico GitHub App):**

    ```env
    PORT=4000
    NODE_ENV=production

    DISCORD_TOKEN=your_discord_bot_token
    DISCORD_CLIENT_ID=your_client_id
    API_URL=https://your-public-octobot-url.example

    MONGODB_URI=mongodb://user:password@localhost:27017/octobot?authSource=admin

    GITHUB_APP_ID=123456
    GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
    GITHUB_WEBHOOK_SECRET=your_webhook_secret_key
    GITHUB_CLIENT_ID=your_github_oauth_client_id
    GITHUB_CLIENT_SECRET=your_github_oauth_client_secret
    ```

---

## 💬 Comandos de Discord (Slash Commands)

La superficie canónica de comandos es **`/gh`** (global):

| Grupo    | Comando            | Parámetros                                               | Descripción                                                                                                |
| -------- | ------------------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| —        | `/gh connect`      | —                                                        | Inicia el flujo seguro de vinculación mediante GitHub App y verificación PKCE. Requiere permisos de Admin. |
| —        | `/gh disconnect`   | `installation_id` (opcional)                             | Desvincula una instalación de GitHub de este servidor. Requiere permisos de Admin.                         |
| —        | `/gh status`       | —                                                        | Muestra las organizaciones conectadas, estado de instalaciones y repositorios suscritos en este servidor.  |
| `repo`   | `/gh repo watch`   | `name:<repo>` (requerido), `events` (opcional)           | Suscribe el canal actual a eventos del repositorio. Requiere permisos de Admin.                            |
| `repo`   | `/gh repo unwatch` | `name:<repo>` (requerido)                                | Desuscribe el canal actual de eventos del repositorio. Requiere permisos de Admin.                         |
| `repo`   | `/gh repo check`   | `name:<repo>` (requerido)                                | Realiza un diagnóstico compuesto de salud de la integración del repositorio.                               |
| `issues` | `/gh issues list`  | `repo:<nombre>` (requerido), `state:[open\|closed\|all]` | Lista issues en vivo del repositorio verificado y suscrito en el servidor.                                 |

> [!NOTE]
> `/github` se mantiene como alias retrocompatible con aviso de deprecación en modo GitHub App, y como ejecutor de comandos V1 en modo `legacy_pat`.

---

## 🌐 Superficie HTTP

- `POST /api/webhooks/github` — Receptor de eventos GitHub (firmado con HMAC SHA-256 sobre rawBody e idempotente por `X-GitHub-Delivery`).
- `GET /api/github/setup` — Endpoint de redirección tras instalación de la GitHub App.
- `GET /api/github/callback` — Endpoint de callback OAuth 2.0 PKCE para prueba de asociación y reclamo seguro.
- `GET /health` — **Liveness Probe**: Estado del proceso HTTP y uptime.
- `GET /ready` — **Readiness Probe**: Verifica conectividad activa con Discord Gateway y MongoDB (`200 READY` o `503 UNREADY`).

---

## 🐳 Docker y Despliegue

```bash
docker build -t octobot:1.0.0 -f Dockerfile .
docker run -d --name octobot -p 4000:4000 --env-file .env octobot:1.0.0
```

- 📖 **[Guía de Despliegue en Producción (DEPLOYMENT.md)](docs/DEPLOYMENT.md)**
- 🧪 **[Guía de Onboarding y Smoke Tests del Piloto (PILOT.md)](docs/PILOT.md)**

---

## 📜 Scripts Disponibles

```bash
bun run dev          # Iniciar con hot reload
bun run start        # Iniciar en producción
bun run build        # Compilar bundle de producción (dist/index.js)
bun test             # Ejecutar suite de pruebas unitarias e integración
bun run typecheck    # Verificación estática TypeScript (tsc --noEmit)
bun run lint         # Análisis estático de código (ESLint 9)
bun run format:check # Comprobación de formato (Prettier)
bun run format       # Autoformateo de código
```

---

## 📄 Licencia

Este proyecto está bajo la [Licencia MIT](LICENSE).
