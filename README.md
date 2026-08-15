# 🤖 OctoBot - GitHub Workflow Assistant

[![Discord.js](https://img.shields.io/badge/discord.js-v14-blue.svg)](https://discord.js.org)
[![Bun](https://img.shields.io/badge/Bun-%3E%3D1.2.0-black.svg)](https://bun.sh)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13.1-brightgreen.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> Asistente de Discord orientado a eventos para equipos de ingeniería. Notifica en tiempo real eventos de GitHub (commits, pull requests, issues, releases y ramas) hacia canales autorizados de Discord, manteniendo a **GitHub como la única fuente de la verdad**.

---

## 📋 Tabla de Contenidos

- [Propósito y Límites](#-propósito-y-límites)
- [Arquitectura y Persistencia](#-arquitectura-y-persistencia)
- [Límites de Seguridad y Permisos](#-límites-de-seguridad-y-permisos)
- [Requisitos](#-requisitos)
- [Instalación y Configuración](#-instalación-y-configuración)
- [Comandos de Discord](#-comandos-de-discord-slash-commands)
- [Superficie HTTP](#-superficie-http)
- [Docker y Base de Datos](#-docker-y-base-de-datos)
- [Scripts Disponibles](#-scripts-disponibles)
- [Pruebas Automatizadas](#-pruebas-automatizadas)
- [Licencia](#-licencia)

---

## 🎯 Propósito y Límites

OctoBot está diseñado como un **GitHub Workflow Assistant** enfocado y seguro:

- 🔔 **Event-driven:** Reacciona a webhooks firmados de GitHub y los canaliza hacia Discord.
- 📖 **GitHub como Source of Truth:** No replica ni almacena copias de repositorios, issues ni commits. Las consultas se realizan en vivo vía Octokit.
- 🛡️ **Superficie HTTP Mínima:** Expone únicamente el receptor de webhooks con firma HMAC SHA-256 (`/api/webhooks/github`) y un healthcheck (`/health`).
- 🔐 **Control de Acceso:** La gestión de suscripciones se realiza exclusivamente mediante Slash Commands en Discord protegidos por permisos de servidor (`Administrator` / `ManageGuild`).

---

## 🏛️ Arquitectura y Persistencia

```mermaid
graph TD
    subgraph GitHub [GitHub Source of Truth]
        GH_Hook[GitHub Webhooks]
        GH_API[GitHub REST API]
    end

    subgraph OctoBot [OctoBot Runtime]
        Ingress[Express Ingress: /api/webhooks/github]
        HMAC[verifyGithubWebhook Middleware]
        Handler[Webhook Event Handler]
        DiscordClient[Discord Bot Client]
        IssueSvc[Live Issue Query Service]
    end

    subgraph Storage [MongoDB: Operational State Only]
        Subs[(RepositorySubscriptions)]
    end

    GH_Hook -->|POST rawBody + x-hub-signature-256| Ingress
    Ingress --> HMAC
    HMAC --> Handler
    Handler -->|Lookup Target Channel| Subs
    Handler -->|Dispatch Notification Embed| DiscordClient
    DiscordClient -->|Alerts| DiscordChannel[Discord Channel]

    DiscordUser[Discord User] -->|/github issues list repo:octobot| DiscordClient
    DiscordClient --> IssueSvc
    IssueSvc -->|Live API Read with PR filter| GH_API

    DiscordAdmin[Discord Admin] -->|/github repo watch / unwatch| DiscordClient
    DiscordClient -->|Manage Subscriptions| Subs
```

### Datos Persistidos en MongoDB (`RepositorySubscription`, `WorkflowAlertState` y `WebhookDelivery`)

MongoDB almacena **únicamente datos operativos propiedad de OctoBot**:

- `RepositorySubscription`:

    - `repositoryFullName`: Nombre del repositorio (e.g. `owner/repo`).
    - `guildId`: ID del servidor de Discord.
    - `channelId`: ID del canal de Discord configurado para recibir alertas.
    - `events`: Tipos de eventos suscritos (`push`, `pull_request`, `pull_request_review`, `workflow_run`, `issues`, etc.).
    - `active`: Estado booleano de la suscripción.
    - `createdAt`, `updatedAt`: Marcas temporales.

- `WorkflowAlertState`:

    - `repositoryFullName`, `workflowId`, `headBranch`: Clave única compuesta para seguimiento de salud de CI.
    - `state`: Estado actual (`healthy` | `failing`).
    - `lastRunId`, `lastRunNumber`, `lastRunAttempt`: Identificadores para deduplicación y protección contra entregas fuera de orden.
    - `lastFailureRunId`, `lastFailureAt`: Metadatos del último fallo registrado.

- `WebhookDelivery` (Idempotencia y Protección Replay):
    - `deliveryId`: GUID global único de entrega de GitHub (`X-GitHub-Delivery`).
    - `eventName`: Nombre del evento de transporte.
    - `status`: Estado del ciclo de vida (`processing` | `completed` | `rejected` | `retryable_failed`).
    - `leaseExpiresAt`: Lease de procesamiento (60 segundos) para recuperación atómica segura ante caídas.
    - `expiresAt`: Retención de 7 días mediante índice TTL de MongoDB (`expireAfterSeconds: 0`).

---

## 🔒 Límites de Seguridad y Permisos

### Capacidades GitHub Requeridas

- Lectura de metadata de repositorios suscritos;
- Lectura de issues en vivo para el comando `/github issues list`;
- Lectura de ejecuciones de GitHub Actions (`Actions: read`) para alertas de CI/CD (`workflow_run`);
- Creación y eliminación de repository webhooks (`watch`, `unwatch`).

OctoBot **no cuenta ni requiere** capacidades para:

- Crear o eliminar repositorios;
- Modificar visibilidad (público/privado);
- Renombrar repositorios o alterar topics.

---

## 📋 Requisitos

- [Bun](https://bun.sh) `>=1.2.0` o [Node.js](https://nodejs.org) `>=22.13.1`
- Docker y Docker Compose para MongoDB
- Aplicación de Discord registrada en [Discord Developer Portal](https://discord.com/developers/applications)
- Token de GitHub (`GITHUB_TOKEN`)
- Clave secreta para webhooks (`GITHUB_WEBHOOK_SECRET`)

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

4. **Variables requeridas en `.env`:**

    ```env
    PORT=4000
    NODE_ENV=development

    # Discord
    DISCORD_TOKEN=your_discord_bot_token
    DISCORD_CHANNEL_ID=your_default_channel_id
    DISCORD_GUILD_ID=your_guild_id
    DISCORD_CLIENT_ID=your_client_id

    # MongoDB (para RepositorySubscriptions)
    MONGO_USER=dev-octobot
    MONGO_PASSWORD=your_password
    MONGO_DATABASE=db-octobot
    MONGODB_URI=mongodb://dev-octobot:your_password@localhost:27017/db-octobot?authSource=admin

    # GitHub
    GITHUB_TOKEN=your_github_token
    GITHUB_OWNER=your_github_username_or_org
    GITHUB_REPO=your_default_repo
    GITHUB_WEBHOOK_SECRET=your_webhook_secret_key
    API_URL=https://your-public-octobot-url.example
    ```

---

## 💬 Comandos de Discord (Slash Commands)

Todos los comandos están agrupados bajo `/github`:

| Grupo    | Comando                      | Parámetros                                               | Descripción                                                                                                          |
| -------- | ---------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `repo`   | `/github repo watch`         | `name:<repo>` (requerido)                                | Configura el webhook en GitHub y crea la suscripción para el canal actual. Requiere `Administrator` o `ManageGuild`. |
| `repo`   | `/github repo unwatch`       | `name:<repo>` (requerido)                                | Elimina la suscripción del canal y retira el webhook de GitHub si no hay otros canales suscritos.                    |
| `repo`   | `/github repo check-webhook` | `name:<repo>` (requerido)                                | Verifica si el webhook está activo en GitHub y muestra el canal suscrito.                                            |
| `issues` | `/github issues list`        | `repo:<nombre>` (requerido), `state:[open\|closed\|all]` | Consulta issues en vivo desde GitHub con paginación interactiva por botones.                                         |

---

## 🌐 Superficie HTTP

### Endpoints Disponibles

- `GET /health` — Estado operacional de Discord, Webhooks y MongoDB (sin exponer secretos).
- `POST /api/webhooks/github` — Receptor principal de eventos GitHub (protegido por middleware HMAC SHA-256 sobre `rawBody`).

### Endpoints Eliminados (`404`)

- `/api/repositories/*` — `404 Not Found`.
- `/api/issues/*` — `404 Not Found`.
- `POST /api/webhooks/github/test` — `404 Not Found`.
- `POST /api/webhooks/github/repository/:repoName` — `404 Not Found`.

---

## 🐳 Docker y Base de Datos

Para levantar el contenedor local de MongoDB:

```bash
docker compose -f docker-compose.development.yml up -d
```

- **MongoDB:** `localhost:27017`
- **Mongo Express:** `http://localhost:8081`

---

## 📜 Scripts Disponibles

```bash
bun run dev          # Iniciar con hot reload
bun run start        # Iniciar en producción
bun test             # Ejecutar suite de pruebas unitarias
bun run typecheck    # Verificación estática TypeScript (tsc --noEmit)
bun run lint         # Análisis estático de código (ESLint 9)
bun run format:check # Comprobación de formato (Prettier)
bun run format       # Autoformateo de código
```

---

## 🧪 Pruebas Automatizadas y CI

La calidad del código y la confiabilidad del pipeline se validan de forma continua mediante GitHub Actions (`CI / validate`):

```bash
bun run typecheck    # Verificación estática TypeScript (tsc --noEmit)
bun run lint         # Análisis estático de código (ESLint 9)
bun run format:check # Comprobación de formato (Prettier)
bun test             # Suite completa de pruebas unitarias e integración
```

Suites de pruebas automatizadas:

- `tests/config/envConfig.test.ts` (validación de variables de entorno)
- `tests/controllers/webhookController.test.ts` (ingress de webhooks e idempotencia)
- `tests/integration/webhookE2E.test.ts` (suite E2E HTTP del pipeline y fan-out)
- `tests/middlewares/verifyGithubWebhook.test.ts` (verificación de firma HMAC)
- `tests/models/subscription.test.ts` (esquema e invariantes de suscripciones)
- `tests/models/webhookDelivery.test.ts` (esquema e índices TTL de deduplicación)
- `tests/models/workflowAlertState.test.ts` (modelo de estado y transición de CI)
- `tests/pipeline/normalizer.test.ts` (normalización tipada de eventos GitHub)
- `tests/pipeline/policy.test.ts` (política de reducción de ruido)
- `tests/pipeline/processor.test.ts` (orquestación del pipeline y control flow)
- `tests/security/publicApiSurface.test.ts` (verificación de superficie HTTP e inmunidad de rutas 404)
- `tests/services/deliveryIdempotencyService.test.ts` (reclamo atómico y leases de entrega)
- `tests/services/discordService.test.ts` (formateo y color de notificaciones)
- `tests/services/repositoryService.test.ts` (mapeo de datos de GitHub)
- `tests/services/webhookService.test.ts` (construcción de webhooks)
- `tests/services/workflowStateService.test.ts` (alertas de fallo y recuperación de CI)
- `tests/utils/validators.test.ts` (validadores de snowflakes, URLs y nombres)

---

## 📄 Licencia

Este proyecto está bajo la [Licencia MIT](LICENSE).
