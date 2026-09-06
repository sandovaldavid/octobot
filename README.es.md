# 🤖 OctoBot — Asistente de Flujos de Trabajo de GitHub

<p align="right">
  <a href="README.md">English</a> | <b>Español</b>
</p>

[![Discord.js](https://img.shields.io/badge/discord.js-v14-blue.svg)](https://discord.js.org)
[![Bun](https://img.shields.io/badge/Bun-%3E%3D1.2.0-black.svg)](https://bun.sh)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13.1-brightgreen.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub App](https://img.shields.io/badge/GitHub-App-24292e.svg)](https://github.com/apps)
[![TypeScript](https://img.shields.io/badge/TypeScript-5%2F6-blue.svg)](https://www.typescriptlang.org)

> Asistente de Discord multi-tenant orientado a eventos para equipos de ingeniería. Notifica en tiempo real eventos de GitHub (pull requests, ejecuciones de CI/CD, issues, commits, ramas, releases) hacia canales autorizados de Discord con aislamiento estricto de tenants, verificación criptográfica HMAC y entrega idempotente, manteniendo a **GitHub como la única fuente de la verdad**.

---

## 📋 Tabla de Contenidos

- [Propósito y Límites de la Arquitectura](#-propósito-y-límites-de-la-arquitectura)
- [Arquitectura y Flujo de Datos Multi-Tenant](#-arquitectura-y-flujo-de-datos-multi-tenant)
- [Modelo de Persistencia en MongoDB](#-modelo-de-persistencia-en-mongodb)
- [Límites de Seguridad y Autenticación](#-límites-de-seguridad-y-autenticación)
- [Comandos de Discord (Superficie Global `/gh`)](#-comandos-de-discord-superficie-global-gh)
- [Superficie HTTP Pública](#-superficie-http-pública)
- [Requisitos Previos](#-requisitos-previos)
- [Instalación e Inicio Rápido](#-instalación-e-inicio-rápido)
- [Configuración de Variables de Entorno](#-configuración-de-variables-de-entorno)
- [Docker y Despliegue en Producción](#-docker-y-despliegue-en-producción)
- [Scripts Disponibles](#-scripts-disponibles)
- [Pruebas Automatizadas](#-pruebas-automatizadas)
- [Licencia](#-licencia)

---

## 🎯 Propósito y Límites de la Arquitectura

OctoBot está diseñado como un **asistente de flujos de trabajo de GitHub** enfocado, seguro y con grado de producción para entornos de ingeniería con múltiples organizaciones:

- 🔔 **Entrega Orientada a Eventos:** Ingiere webhooks firmados criptográficamente desde GitHub App y enruta notificaciones ricas y accionables (embeds) a los canales de Discord suscritos en tiempo real.
- 🏢 **Multi-Tenancy Estricto:** Una única instancia de ejecución atiende de forma segura múltiples servidores de Discord (guilds) vinculados a múltiples instalaciones de GitHub App (organizaciones o cuentas de usuario) sin fuga de información entre tenants.
- 📖 **GitHub como Única Fuente de la Verdad:** Cero replicación de contenido en base de datos. Los repositorios, pull requests, issues e historiales de commits nunca se duplican ni persisten en MongoDB.
- 🛡️ **Superficie de Ataque HTTP Mínima:** Expone estrictamente lo necesario: el receptor de webhooks (`/api/webhooks/github`), el handshake de vinculación (`/api/github/setup`, `/api/github/callback`) y las sondas de liveness y readiness (`/health`, `/ready`). La administración de repositorios o consulta de issues nunca se expone sobre HTTP.
- 🔒 **Enrutamiento de Suscripciones Fail-Closed:** La entrega de eventos verifica rigurosamente una comprobación de 3 puntos antes del despacho: suscripción activa en el canal, vinculación guild-instalación verificada y estado activo de la instalación en GitHub.
- 🔕 **Reducción Inteligente de Ruido:** Suprime notificaciones redundantes sin valor operativo (p. ej., eventos `synchronize` por nuevos commits en PRs abiertas, fallos repetidos en ejecuciones/intentos consecutivos de CI para la misma rama), garantizando la entrega inmediata de transiciones accionables (primer fallo de CI, recuperación de CI, aprobaciones de PR, preparación para merge).
- 🔐 **Control de Acceso Basado en Roles (RBAC):** Los comandos de mutación (`connect`, `disconnect`, `watch`, `unwatch`) requieren permisos de `Administrator` o `Manage Server` (`ManageGuild`) en Discord. Los comandos de consulta de solo lectura (`status`, `check`, `issues list`) están disponibles para todos los miembros del servidor.

---

## 🏛️ Arquitectura y Flujo de Datos Multi-Tenant

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

## 🗄️ Modelo de Persistencia en MongoDB

MongoDB almacena **únicamente el estado operativo, relacional y de idempotencia propiedad de OctoBot**. El código fuente de repositorios, descripciones de issues, diffs de PRs y registros de commits nunca se almacenan.

| Modelo                                    | Claves Primarias / Índices                                                                                                                               | Ciclo de Vida / TTL                                     | Atributos Persistidos                                                                                                                                                                                                |
| :---------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GitHubInstallation`                      | `installationId` (único), `accountLogin`                                                                                                                 | Persistente (actualizado vía webhooks / onboarding)     | `installationId`, `accountId`, `accountLogin`, `accountType` (`Organization` \| `User`), `status` (`active` \| `suspended` \| `revoked`), `repositorySelection` (`all` \| `selected`), `permissions`, `events`.      |
| `DiscordGuildConnection`                  | Compuesto único: `{ guildId: 1, installationId: 1 }`                                                                                                     | Persistente                                             | `guildId`, `installationId`, `status` (`connected` \| `disconnected`), `connectedByDiscordUserId`.                                                                                                                   |
| `GitHubConnectionAttempt`                 | `installStateHash` (único), `oauthStateHash` (único, sparse)                                                                                             | **TTL: 10 minutos** (`expireAfterSeconds: 0`)           | `installStateHash`, `oauthStateHash`, `oauthCodeVerifier`, `guildId`, `initiatedByDiscordUserId`, `candidateInstallationId`, `status` (`pending_setup` \| `pending_oauth` \| `verifying` \| `consumed` \| `failed`). |
| `Subscription` (`RepositorySubscription`) | Compuesto único: `{ installationId: 1, repositoryId: 1, guildId: 1, channelId: 1 }`<br>Enrutamiento: `{ installationId: 1, repositoryId: 1, active: 1 }` | Persistente                                             | `installationId`, `repositoryId`, `repositoryFullName`, `guildId`, `channelId`, `events` (`WebhookEventType[]`), `active` (booleano), `createdByDiscordUserId`.                                                      |
| `WebhookDelivery`                         | `deliveryId` (único desde `X-GitHub-Delivery`)                                                                                                           | **Lease: 60 segundos**<br>**TTL: 7 días** (`expiresAt`) | `deliveryId`, `eventName`, `status` (`processing` \| `completed` \| `rejected` \| `retryable_failed`), `attemptCount`, `leaseExpiresAt`, `completedAt`, `finalOutcome`, `responseStatus`, `expiresAt`.               |
| `WorkflowAlertState`                      | Compuesto único: `{ repositoryFullName: 1, workflowId: 1, headBranch: 1 }`                                                                               | Persistente                                             | `repositoryFullName`, `workflowId`, `headBranch`, `state` (`healthy` \| `failing`), `lastRunId`, `lastRunNumber`, `lastRunAttempt`, `lastFailureRunId`, `lastFailureAt`.                                             |

---

## 🔒 Límites de Seguridad y Autenticación

### 1. Verificación de Firmas de Webhooks (HMAC-SHA256)

- Los webhooks recibidos en `POST /api/webhooks/github` son verificados contra `GITHUB_WEBHOOK_SECRET` antes de cualquier análisis o procesamiento.
- La verificación se ejecuta directamente sobre el payload crudo (`req.rawBody`, buffer sin parsear) mediante `crypto.createHmac('sha256', secret)`.
- Los hashes calculados se comparan en tiempo constante utilizando `crypto.timingSafeEqual` para prevenir ataques de canal lateral basados en temporización (timing attacks).
- Cualquier solicitud sin las cabeceras requeridas (`x-github-event`, `x-github-delivery`, `x-hub-signature-256`) o con firma inválida se rechaza de inmediato con código `400` o `401`.

### 2. Handshake de Onboarding y Prueba de Asociación (OAuth 2.0 con PKCE)

- Al invocar `/gh connect` en un servidor de Discord se genera un registro efímero `GitHubConnectionAttempt` que almacena un nonce de setup con hash criptográfico SHA-256 y expiración de 10 minutos.
- En `/api/github/setup`, OctoBot crea un `code_verifier` aleatorio y su derivado `code_challenge` (S256), vinculándolos a un nonce de OAuth antes de redirigir al usuario hacia GitHub.
- En `/api/github/callback`, OctoBot comprueba el hash del state, intercambia el código de autorización con GitHub utilizando el verifier y consulta el endpoint `/user/installations` con el token de usuario.
- OctoBot verifica que el usuario autenticado en GitHub posea efectivamente privilegios administrativos sobre el `installationId` objetivo antes de crear o actualizar el registro `DiscordGuildConnection`.

### 3. Idempotencia y Protección Contra Replay en Webhooks

- Cada webhook entrante se custodia por su GUID `X-GitHub-Delivery` mediante `DeliveryIdempotencyService`.
- Una inserción atómica (`status: 'processing'`, lease de 60s) reclama la entrega. Si llegan entregas duplicadas concurrentemente o por reintentos manuales de GitHub:
    - Entregas ya completadas (`status: 'completed'`) responden `200 OK` con resultado `ignored_duplicate`.
    - Entregas en curso dentro de su lease activo responden `202 Accepted` con resultado `ignored_duplicate_in_flight`.
    - Leases expirados por caídas anómalas del proceso se reclaman de forma atómica para evitar bloqueos permanentes.

### 4. Permisos de Comandos de Discord (RBAC)

- Validados en el punto de entrada del despachador mediante `verifyCommandAuthorization`:
    - **Comandos de mutación** (`/gh connect`, `/gh disconnect`, `/gh repo watch`, `/gh repo unwatch`) exigen permisos de `Administrator` o `Manage Server` (`ManageGuild`). Las ejecuciones no autorizadas son rechazadas con una respuesta efímera.
    - **Comandos de consulta** (`/gh status`, `/gh repo check`, `/gh issues list`) son accesibles para todos los miembros del servidor.

---

## 💬 Comandos de Discord (Superficie Global `/gh`)

La interfaz canónica de comandos está registrada globalmente bajo `/gh`:

| Grupo    | Comando            | Opciones / Parámetros                                                                | Permiso Requerido                 | Descripción                                                                                      |
| :------- | :----------------- | :----------------------------------------------------------------------------------- | :-------------------------------- | :----------------------------------------------------------------------------------------------- |
| —        | `/gh connect`      | —                                                                                    | `Administrator` / `Manage Server` | Inicia el flujo seguro de vinculación mediante GitHub App y verificación PKCE.                   |
| —        | `/gh disconnect`   | `installation_id` _(opcional)_                                                       | `Administrator` / `Manage Server` | Desvincula una instalación de GitHub de este servidor de Discord.                                |
| —        | `/gh status`       | —                                                                                    | Todos (Miembro del Servidor)      | Muestra las organizaciones conectadas, estado de instalaciones y canales suscritos.              |
| `repo`   | `/gh repo watch`   | `name:<owner/repo>` _(requerido)_<br>`events:<lista>` _(opcional)_                   | `Administrator` / `Manage Server` | Suscribe el canal actual a eventos del repositorio especificado.                                 |
| `repo`   | `/gh repo unwatch` | `name:<owner/repo>` _(requerido)_                                                    | `Administrator` / `Manage Server` | Elimina las suscripciones a eventos del repositorio en el canal actual.                          |
| `repo`   | `/gh repo check`   | `name:<owner/repo>` _(requerido)_                                                    | Todos (Miembro del Servidor)      | Ejecuta un diagnóstico compuesto de conectividad, instalación y suscripción del repositorio.     |
| `issues` | `/gh issues list`  | `repo:<owner/repo>` _(requerido)_<br>`state:[open\|closed\|all]`<br>`limit:<número>` | Todos (Miembro del Servidor)      | Consulta issues en vivo mediante Octokit acotado a la instalación sin replicar datos en MongoDB. |

> [!NOTE]
> El namespace legado `/github` se mantiene como alias retrocompatible. En modo GitHub App añade un aviso de deprecación orientando al uso de `/gh`. En modo `legacy_pat` enruta hacia los manejadores legados.

---

## 🌐 Superficie HTTP Pública

OctoBot expone una superficie HTTP estrictamente acotada:

| Método | Endpoint               | Propósito                                                                          | Seguridad y Autenticación                                                                           |
| :----- | :--------------------- | :--------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------- |
| `POST` | `/api/webhooks/github` | Receptor de entregas de webhooks de GitHub App.                                    | Firma HMAC SHA-256 (`x-hub-signature-256`) + reclamo atómico de idempotencia.                       |
| `GET`  | `/api/github/setup`    | Redirección posterior a la instalación de GitHub App.                              | Validación de nonce criptográfico; emisión de desafío PKCE.                                         |
| `GET`  | `/api/github/callback` | Callback de autorización OAuth 2.0 PKCE.                                           | Valida hash de estado, intercambia código con verifier y comprueba membresía.                       |
| `GET`  | `/health`              | **Sonda de Liveness**: Confirma uptime del proceso HTTP y conectores.              | Pública; expone uptime, estado de Discord, configuración de webhook y estado de base de datos.      |
| `GET`  | `/ready`               | **Sonda de Readiness**: Confirma conectividad activa de Discord Gateway y MongoDB. | Pública; retorna `200 READY` si ambos subsistemas están activos, o `503 UNREADY` en caso contrario. |

> [!IMPORTANT]
> La mutación de repositorios, sincronización de issues o simulación de webhooks no se exponen bajo ninguna circunstancia por HTTP. Cualquier solicitud a rutas no montadas responde `404 Not Found`.

---

## 📋 Requisitos Previos

- [Bun](https://bun.sh) `>=1.2.0` _(recomendado)_ o [Node.js](https://nodejs.org) `>=22.13.1`
- [MongoDB](https://www.mongodb.com) 6.0+ (instancia dedicada, replica set o vía Docker Compose)
- Una **Aplicación y Bot de Discord** registrada con Bot Token y Client ID desde el [Discord Developer Portal](https://discord.com/developers/applications)
- Una **GitHub App** configurada con:
    - **Permisos de Repositorio:**
        - Issues: Solo lectura
        - Pull requests: Solo lectura
        - Actions / Workflows: Solo lectura
        - Contents / Commits: Solo lectura
        - Metadata: Solo lectura
    - **Suscripción a Eventos:** `issues`, `pull_request`, `push`, `release`, `workflow_run`, `installation`, `installation_repositories`
    - **Webhook URL:** `https://your-public-url.example/api/webhooks/github`
    - **Setup URL (Redirección):** `https://your-public-url.example/api/github/setup`
    - **Callback URL:** `https://your-public-url.example/api/github/callback`
    - **Webhook Secret** y clave privada generada **RSA Private Key** (.pem)

---

## 🚀 Instalación e Inicio Rápido

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

4. **Iniciar base de datos local (Docker Compose):**

    ```bash
    docker compose -f docker-compose.development.yml up -d
    ```

5. **Iniciar el servidor de desarrollo (con hot reload):**
    ```bash
    bun run dev
    ```

---

## ⚙️ Configuración de Variables de Entorno

Configuración canónica para **Modo GitHub App** en `.env`:

```env
# Servidor y Entorno
PORT=4000
NODE_ENV=production

# Configuración de Discord
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id

# URL Pública (debe coincidir con la configuración de la GitHub App)
API_URL=https://octobot.yourdomain.com

# Persistencia en MongoDB
MONGODB_URI=mongodb://user:password@localhost:27017/octobot?authSource=admin

# Credenciales de GitHub App
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your_webhook_secret_key
GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret
GITHUB_APP_SLUG=octobot
```

---

## 🐳 Docker y Despliegue en Producción

### Construcción y Ejecución con Docker

```bash
# Construir la imagen de producción
docker build -t octobot:1.0.0 -f Dockerfile .

# Ejecutar el contenedor con variables de entorno
docker run -d \
  --name octobot \
  --restart unless-stopped \
  -p 4000:4000 \
  --env-file .env \
  octobot:1.0.0
```

> [!IMPORTANT]
> **Restricción de Réplica Única:** OctoBot mantiene una conexión WebSocket persistente contra Discord Gateway y administra interacciones de slash commands. Debe desplegarse como **1 réplica** salvo que se implemente un proxy de gateway o arquitectura de sharding externa.

Para detalles exhaustivos de arquitectura en producción, ingress y verificación operativa, consulta:

- 📖 **[Guía de Despliegue en Producción (`docs/DEPLOYMENT.md`)](docs/DEPLOYMENT.md)**
- 🧪 **[Matriz de Verificación y Onboarding del Piloto (`docs/PILOT.md`)](docs/PILOT.md)**

---

## 📜 Scripts Disponibles

| Script         | Comando                | Propósito                                                                      |
| :------------- | :--------------------- | :----------------------------------------------------------------------------- |
| `dev`          | `bun run dev`          | Ejecuta el bot localmente con hot reload de Bun (`--hot src/index.ts`).        |
| `start`        | `bun run start`        | Inicia el punto de entrada en modo de ejecución estándar.                      |
| `build`        | `bun run build`        | Compila el bundle de producción en `./dist` con destino Node.js.               |
| `test`         | `bun test`             | Ejecuta la suite completa de pruebas unitarias, de integración y de seguridad. |
| `typecheck`    | `bun run typecheck`    | Valida el tipado estático de TypeScript (`tsc --noEmit`).                      |
| `lint`         | `bun run lint`         | Analiza el código según las reglas de ESLint 9 (configuración plana).          |
| `lint:fix`     | `bun run lint:fix`     | Corrige automáticamente problemas de formato y reglas de ESLint.               |
| `format:check` | `bun run format:check` | Comprueba el formateo del código con Prettier.                                 |
| `format`       | `bun run format`       | Autoformatea archivos de código y markdown con Prettier.                       |

---

## 🧪 Pruebas Automatizadas

OctoBot cuenta con cobertura exhaustiva de pruebas automatizadas en lógica de dominio, restricciones de seguridad y flujos de integración:

```bash
bun test
```

### Aspectos Destacados de Cobertura

- **238 pruebas superadas** a lo largo de 28 suites de pruebas en ~3.2 segundos.
- **Pruebas de Superficie de Seguridad (`tests/security/`):** Comprueban que rutas HTTP no autorizadas (p. ej., `/api/repositories`, `/api/issues`) devuelvan `404`, y validan la verificación HMAC y el aislamiento multi-tenant.
- **Motor de Idempotencia (`tests/services/deliveryIdempotencyService.test.ts`):** Valida reclamos atómicos de lease, condiciones de carrera, reapropiación de leases expirados y supresión de entregas duplicadas.
- **Handshake de Onboarding (`tests/controllers/githubOnboardingController.test.ts`):** Comprueba generación de nonces de setup, intercambio PKCE, manejo de sesiones expiradas y validación de permisos de usuario.
- **Enrutamiento Multi-Tenant (`tests/pipeline/multiTenantRouting.test.ts`):** Verifica comprobaciones fail-closed sobre vinculaciones de tenants, instalaciones suspendidas y filtros de eventos por canal.
- **Políticas de Discord (`tests/services/discord/commandPolicy.test.ts`):** Asegura la aplicación estricta de RBAC en subcomandos administrativos.

---

## 📄 Licencia

Este proyecto se distribuye bajo la [Licencia MIT](LICENSE).
