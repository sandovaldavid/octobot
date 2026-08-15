# 🤖 OctoBot - GitHub & Discord Integration Bot

[![Discord.js](https://img.shields.io/badge/discord.js-v14-blue.svg)](https://discord.js.org)
[![Bun](https://img.shields.io/badge/Bun-%3E%3D1.2.0-black.svg)](https://bun.sh)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13.1-brightgreen.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> Bot de Discord y API REST desarrollado con TypeScript, Discord.js, Express y MongoDB para sincronizar, monitorear y recibir notificaciones en tiempo real de eventos de GitHub (commits, pull requests, issues, ramas y releases).

---

## 📋 Tabla de Contenidos

- [Características](#-características)
- [Arquitectura](#-arquitectura)
- [Requisitos](#-requisitos)
- [Instalación y Configuración](#-instalación-y-configuración)
- [Comandos de Discord](#-comandos-de-discord-slash-commands)
- [API REST](#-api-rest)
- [Docker y Base de Datos](#-docker-y-base-de-datos)
- [Scripts Disponibles](#-scripts-disponibles)
- [Pruebas Automatizadas](#-pruebas-automatizadas)

---

## ✨ Características

- 🔔 **Notificaciones de GitHub en tiempo real:** Embeds personalizados para eventos de `push` (commits), `pull_request`, `issues`, `release`, `create` (ramas) y `delete` (ramas).
- 🎮 **Slash Commands (`/github`):** Monitorea repositorios directamente desde canales de Discord.
- 📑 **Paginación Interactiva de Issues:** Navegación por botones en Discord para consultar issues abiertos, cerrados o todos.
- 🔄 **Sincronización Automática:** Almacenamiento y sincronización de repositorios, issues, commits y webhooks en MongoDB.
- 🛡️ **Seguridad HMAC:** Verificación criptográfica con `crypto.timingSafeEqual` y soporte de `rawBody` para webhooks de GitHub.
- 🌐 **API REST Integrada:** Endpoints para gestión de repositorios, estadísticas y consulta de issues.

---

## 🏛️ Arquitectura

```mermaid
graph TD
    GH[GitHub Repositories / Webhooks] -->|POST /api/webhooks/github| API[Express API & Webhook Controller]
    User[Discord User] -->|/github repo / issues| Bot[Discord Bot Client]
    API --> Handler[Webhook Handler]
    Handler --> DiscordSvc[Discord Notification Service]
    DiscordSvc --> Bot
    Bot --> Channel[Discord Channel]
    API --> Mongo[(MongoDB)]
    Bot --> Mongo
```

---

## 📋 Requisitos

- [Bun](https://bun.sh) `>=1.2.0` o [Node.js](https://nodejs.org) `>=22.13.1`
- Docker y Docker Compose (para MongoDB local y Mongo Express)
- Aplicación de Discord registrada en [Discord Developer Portal](https://discord.com/developers/applications)
- Personal Access Token de GitHub con permisos de lectura/escritura de repositorios y webhooks

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
    PORT=1234
    NODE_ENV=development

    # Discord
    DISCORD_TOKEN=your_discord_bot_token
    DISCORD_CHANNEL_ID=your_default_channel_id
    DISCORD_GUILD_ID=your_guild_id
    DISCORD_CLIENT_ID=your_client_id

    # MongoDB
    MONGO_USER=dev-octobot
    MONGO_PASSWORD=your_password
    MONGO_DATABASE=db-octobot
    MONGODB_URI=mongodb://dev-octobot:your_password@localhost:27017/db-octobot?authSource=admin

    # GitHub
    GITHUB_TOKEN=your_github_personal_access_token
    GITHUB_OWNER=your_github_username_or_org
    GITHUB_REPO=your_default_repo
    GITHUB_WEBHOOK_SECRET=your_webhook_secret_key
    API_URL=https://your-public-webhook-url.ngrok-free.app
    ```

---

## 💬 Comandos de Discord (Slash Commands)

Todos los comandos están agrupados bajo `/github`:

| Grupo    | Comando                      | Parámetros                                   | Descripción                                                                |
| -------- | ---------------------------- | -------------------------------------------- | -------------------------------------------------------------------------- |
| `repo`   | `/github repo watch`         | `name:<repo>` (requerido)                    | Configura el webhook en GitHub y envía alertas al canal de Discord actual. |
| `repo`   | `/github repo unwatch`       | `name:<repo>` (requerido)                    | Elimina el webhook en GitHub y desactiva el monitoreo.                     |
| `repo`   | `/github repo sync`          | Ninguno                                      | Sincroniza todos los repositorios de GitHub con MongoDB.                   |
| `repo`   | `/github repo check-webhook` | `name:<repo>` (requerido)                    | Verifica si el webhook está activo y configurado.                          |
| `issues` | `/github issues list`        | `state:[open\|closed\|all]`, `repo:[nombre]` | Lista issues interactivos con botones de paginación previa/siguiente.      |

---

## 🌐 API REST

### Estado del Sistema

- `GET /health` - Retorna el estado de conexión de Discord, Webhooks y MongoDB.

### Webhooks

- `POST /api/webhooks/github` - Receptor principal de eventos webhook de GitHub (con validación de firma HMAC SHA-256).
- `POST /api/webhooks/github/test` - Endpoint de prueba para simular un webhook push.
- `POST /api/webhooks/github/repository/:repoName` - Configuración automática de webhook para un repositorio.

### Repositorios

- `GET /api/repositories/github` - Lista repositorios directamente desde GitHub.
- `GET /api/repositories/stored` - Lista repositorios persistidos en MongoDB.
- `POST /api/repositories/sync` - Sincroniza repositorios desde GitHub hacia MongoDB.
- `GET /api/repositories/:repoName/stats` - Retorna estadísticas detalladas de commits, lenguajes y colaboradores.
- `GET /api/repositories/search?query=...` - Búsqueda de repositorios por nombre o descripción.

### Issues

- `GET /api/issues` - Consulta de issues con filtros (`state`, `labels`, `since`, `page`, `per_page`).
- `GET /api/issues/:issueNumber?repo=...` - Consulta de un issue específico por número.
- `GET /api/issues/repository/:repoName` - Consulta de issues asociados a un repositorio.
- `POST /api/issues/sync` - Sincroniza los issues de todos los repositorios en MongoDB.

---

## 🐳 Docker y Base de Datos

Para levantar MongoDB y la interfaz gráfica de administración (Mongo Express):

```bash
docker compose -f docker-compose.development.yml up -d
```

- **MongoDB:** `localhost:27017`
- **Mongo Express:** `http://localhost:8081`

---

## 📜 Scripts Disponibles

```bash
# Iniciar en modo desarrollo con hot reload
bun run dev

# Iniciar en modo producción
bun run start

# Ejecutar suite de pruebas unitarias
bun test

# Ejecutar linter
bun run lint

# Formatear código con Prettier
bun run format
```

---

## 🧪 Pruebas Automatizadas

El proyecto cuenta con suites de pruebas unitarias construidas con el runner nativo de Bun:

```bash
bun test
```

Ubicación de tests:

- `tests/utils/validators.test.ts`
- `tests/services/discordService.test.ts`
- `tests/services/repositoryService.test.ts`
- `tests/services/webhookService.test.ts`

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT.
