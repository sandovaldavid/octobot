# 🤖 OctoBot - Discord Bot

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Discord.js](https://img.shields.io/badge/discord.js-v14-blue.svg)](https://discord.js.org)
[![Node.js](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

> A powerful and feature-rich Discord bot built with Discord.js to enhance your server experience

## 📋 Table of Contents

- [Features](#-features)
- [Requirements](#-requirements)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Usage](#-usage)
- [Commands](#-commands)
- [Scripts](#-scripts)
- [Deployment](#-deployment)
- [Contributing](#-contributing)
- [License](#-license)

## ✨ Features

- 🔊 Voice channel management
- 🎮 Fun commands and games
- 🛡️ Moderation tools
- 🎵 Music playback
- 📊 Server statistics
- 🎉 Welcome messages
- ⚙️ Customizable prefix and settings

## 📋 Requirements

- Node.js 16.0.0 or newer
- Discord account and registered application
- MongoDB (optional, for data persistence)

## 🚀 Installation

1. Clone the repository:

```bash
git clone https://github.com/sandovaldavid/octobot.git
cd octobot
```

2. Install dependencies:

```bash
npm install
```

3. Copy the example environment file:

```bash
cp .env.example .env
```

4. Edit the `.env` file with your Discord bot token and other settings.

## ⚙️ Configuration

Edit the `.env` file with your Discord bot credentials:

```
# Bot Configuration
BOT_TOKEN=your_discord_token_here
CLIENT_ID=your_client_id_here
GUILD_ID=your_guild_id_here

# Database Configuration (optional)
MONGODB_URI=your_mongodb_connection_string

# Additional Settings
PREFIX=!
ENVIRONMENT=development
```

## 🖥️ Usage

To start the bot in development mode:

```bash
npm run dev
```

For production:

```bash
npm start
```

## 💬 Commands

| Command | Description |
|---------|-------------|
| `!help` | Displays all available commands |
| `!ping` | Check bot's response time |
| `!play <song>` | Play a song in your voice channel |
| `!ban <user>` | Ban a user from the server |
| `!kick <user>` | Kick a user from the server |
| `!stats` | Show server statistics |

## 📜 Scripts

The project includes several npm scripts:

- `npm start` - Start the bot in production mode
- `npm run dev` - Start the bot with nodemon for development
- `npm run lint` - Run ESLint to check code quality
- `npm run test` - Run tests
- `npm run deploy-commands` - Deploy slash commands to Discord
- `npm run build` - Build the TypeScript project (if applicable)

## 🌐 Deployment

### Local Development

1. Complete the installation and configuration steps
2. Run `npm run dev` to start the bot in development mode
3. The bot will automatically restart when changes are detected

### Production Hosting

The bot can be hosted on:

- **Heroku**: Use a Procfile with `worker: npm start`
- **DigitalOcean/AWS**: Use PM2 to manage the Node.js process
- **Railway/Render**: Connect your GitHub repository for continuous deployment

Example PM2 setup:

```bash
npm install -g pm2
pm2 start npm --name "octobot" -- start
pm2 save
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add some amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

Made by @sandovaldavid | [GitHub](https://github.com/sandovaldavid)
