# 🤖 OctoBot - GitHub Workflow Assistant

[![Discord.js](https://img.shields.io/badge/discord.js-v14-blue.svg)](https://discord.js.org)
[![Bun](https://img.shields.io/badge/Bun-%3E%3D1.2.0-black.svg)](https://bun.sh)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13.1-brightgreen.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> GitHub Workflow Assistant desarrollado con TypeScript, Discord.js y Express para recibir eventos verificados de GitHub y entregar notificaciones accionables en Discord.

OctoBot no es una API general de administración de GitHub. GitHub permanece como fuente de verdad; OctoBot se encarga de suscripciones, recepción/verificación de webhooks y entrega de notificaciones.

---

## 📋 Tabla de Contenidos

- [Características](#-características)
- [Arquitectura](#-arquitectura)
- [Límite de Seguridad](#-límite-de-seguridad)
- [Requisitos](#-requisitos)
- [Instalación y Configuración](#-instalación-y-configuración)
- [Comandos de Discord](#-comandos-de-discord-slash-commands)
- [Superficie HTTP](#-superficie-http)
- [Docker y Base de Datos](#-docker-y-base-de-datos)
- [Scripts Disponibles](#-scripts-disponibles)
- [Pruebas Automatizadas](#-pruebas-automatizadas)

---

## ✨ Características

- 🔔 **Notificaciones de GitHub en tiempo real:** Embeds para eventos de `push`, `pull_request`, `issues`, `release`, `create` y `delete`.
- 🎮 **Slash Commands (`/github`):** Administración del monitoreo desde Discord.
- 📑 **Consulta interactiva de issues:** Navegación de issues desde Discord.
- 🛡️ **Seguridad HMAC:** Verificación SHA-256 de webhooks usando el body original de la petición.
- 🔐 **Administración acotada:** La configuración de webhooks se realiza mediante comandos de Discord con permisos administrativos; no existe una API REST pública para crear, borrar o modificar repositorios de GitHub.
- 🔄 **Persistencia actual:** El proyecto todavía contiene sincronización de repositorios/issues en MongoDB. Esta capacidad será revisada por separado dentro del re-scope V1 y no debe considerarse una segunda fuente de verdad.

---

## 🏛️ Arquitectura

```mermaid
graph TD
    GH[GitHub Repositories / Webhooks] -->|signed POST /api/webhooks/github| API[Express webhook ingress]
    User[Authorized Discord User] -->|/github repo watch / unwatch| Bot[Discord Bot]
    API --> Handler[Webhook Handler]
    Handler --> DiscordSvc[Discord Notification Service]
    DiscordSvc --> Channel[Discord Channel]
    Bot --> GH
    Bot --> Mongo[(MongoDB - temporary operational persistence)]
    API --> Mongo
```

Responsabilidades:

```text
GitHub
→ estado canónico del repositorio

OctoBot
→ suscripciones, verificación de eventos, routing y entrega

Discord
→ superficie administrativa autorizada y notificaciones

MongoDB
→ persistencia operacional existente; no es fuente canónica de GitHub
```

---

## 🔐 Límite de Seguridad

La superficie HTTP pública se mantiene deliberadamente pequeña.

### Eliminado del runtime HTTP

OctoBot no monta `/api/repositories`. Por tanto, no existe una ruta HTTP pública para:

- crear repositorios;
- borrar repositorios;
- renombrar o actualizar repositorios;
- cambiar visibilidad;
- reemplazar topics/settings;
- listar repositorios privados usando las credenciales del bot;
- consultar el mirror de repositorios mediante REST.

También se eliminaron:

- `POST /api/webhooks/github/test`;
- `POST /api/webhooks/github/repository/:repoName`.

La administración de suscripciones se mantiene en los comandos autorizados de Discord (`watch`, `unwatch`, `check-webhook`).

### Capacidades de GitHub requeridas

El código V1 actual necesita únicamente capacidades asociadas a los flujos retenidos:

- lectura de metadata de repositorios utilizada por las funciones internas actuales;
- lectura de issues mientras exista esa funcionalidad;
- lectura/escritura de repository webhooks para `watch`, `unwatch` y verificación de configuración.

OctoBot ya no necesita capacidades para:

- eliminar repositorios;
- crear repositorios;
- modificar visibilidad;
- renombrar repositorios;
- modificar topics/settings mediante una API administrativa propia.

Al configurar `GITHUB_TOKEN`, utiliza el token más acotado que soporte los repositorios y capacidades anteriores. La reducción adicional de permisos deberá acompañar la futura eliminación del mirroring de repositorios/issues.

---

## 📋 Requisitos

- [Bun](https://bun.sh) `>=1.2.0` o [Node.js](https://nodejs.org) `>=22.13.1`
- Docker y Docker Compose para el entorno MongoDB actual
- Aplicación registrada de Discord
- Token de GitHub limitado a los repositorios/capacidades realmente requeridos
- Webhook secret compartido entre GitHub y OctoBot

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
    GITHUB_TOKEN=your_github_token
    GITHUB_OWNER=your_github_username_or_org
    GITHUB_REPO=your_default_repo
    GITHUB_WEBHOOK_SECRET=your_webhook_secret_key
    API_URL=https://your-public-octobot-url.example
    ```

---

## 💬 Comandos de Discord (Slash Commands)

Todos los comandos están agrupados bajo `/github`:

| Grupo    | Comando                      | Parámetros                                   | Descripción                                                            |
| -------- | ---------------------------- | -------------------------------------------- | ---------------------------------------------------------------------- |
| `repo`   | `/github repo watch`         | `name:<repo>` (requerido)                    | Configura el webhook y asocia el repositorio al canal actual.          |
| `repo`   | `/github repo unwatch`       | `name:<repo>` (requerido)                    | Elimina el webhook y desactiva el monitoreo.                           |
| `repo`   | `/github repo sync`          | Ninguno                                      | Sincronización interna heredada con MongoDB; pendiente de revisión V1. |
| `repo`   | `/github repo check-webhook` | `name:<repo>` (requerido)                    | Verifica si el webhook del repositorio está configurado.               |
| `issues` | `/github issues list`        | `state:[open\|closed\|all]`, `repo:[nombre]` | Lista issues mediante navegación interactiva.                          |

Los comandos administrativos de repositorio requieren permisos de Discord `Administrator` o `ManageGuild` según la implementación actual.

---

## 🌐 Superficie HTTP

### Retenido

- `GET /health` — estado operacional básico sin credenciales.
- `POST /api/webhooks/github` — receptor de GitHub protegido por verificación HMAC.
- `/api/issues/*` — superficie heredada de issues mientras se completa el workstream de persistencia/mirroring.

### No expuesto

- `/api/repositories/*` — `404` por diseño.
- `POST /api/webhooks/github/test` — `404` por diseño.
- `POST /api/webhooks/github/repository/:repoName` — `404` por diseño.

La configuración de repository webhooks no se realiza mediante HTTP público; utiliza los comandos autorizados de Discord.

---

## 🐳 Docker y Base de Datos

Para levantar el entorno MongoDB actual:

```bash
docker compose -f docker-compose.development.yml up -d
```

- **MongoDB:** `localhost:27017`
- **Mongo Express:** `http://localhost:8081`

MongoDB sigue formando parte de la implementación actual, pero su alcance se revisará en el workstream V1 de eliminación del mirroring de GitHub.

---

## 📜 Scripts Disponibles

```bash
bun run dev
bun run start
bun test
bun run typecheck
bun run lint
bun run lint:fix
bun run format
bun run format:check
```

---

## 🧪 Pruebas Automatizadas

La suite utiliza el runner nativo de Bun.

```bash
bun test
```

La cobertura incluye validadores, configuración, servicios, verificación HMAC y regresiones de la superficie HTTP pública. Los tests de seguridad confirman que las antiguas rutas administrativas retornan `404` y que el receptor de webhooks continúa protegido.

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT.
