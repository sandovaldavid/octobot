import dotenv from 'dotenv';
dotenv.config();

import { Server } from 'http';
import mongoose from 'mongoose';
import { REST, Routes } from 'discord.js';
import { validateEnv } from '@config/envConfig';
import { connectDB } from '@config/databaseConfig';
import { discordClient } from '@config/discordConfig';
import { debug, logger } from '@utils/logger';
import { githubClient } from '@config/githubConfig';
import { commandRegistry } from '@commands/index';
import { createApp } from '@/app';

// 1. Canonical Configuration Bootstrap Gate
const env = validateEnv();

const client = discordClient.getClient();
let server: Server | null = null;
let isShuttingDown = false;

const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`Received ${signal}. Starting graceful shutdown...`);

    try {
        // 1. Stop accepting new HTTP requests
        if (server) {
            await new Promise<void>((resolve) => {
                server!.close(() => {
                    logger.info('HTTP server closed successfully.');
                    resolve();
                });
            });
        }

        // 2. Disconnect Discord gateway client
        if (client.isReady()) {
            client.destroy();
            logger.info('Discord client disconnected.');
        }

        // 3. Close MongoDB connection
        if (mongoose.connection.readyState !== 0) {
            await mongoose.connection.close();
            logger.info('MongoDB connection closed.');
        }

        logger.info('Graceful shutdown completed. Exiting.');
        process.exit(0);
    } catch (error) {
        logger.error('Error during graceful shutdown:', error);
        process.exit(1);
    }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

const initializeServices = async () => {
    try {
        logger.info(`Starting OctoBot V1 (Node: ${process.version}, Env: ${env.NODE_ENV})...`);

        // 2. Connect to database
        await connectDB();

        // 3. Test Discord connection
        const discordConnected = await discordClient.testConnection();
        if (!discordConnected) {
            throw new Error('Failed to connect to Discord');
        }

        // 4. Register slash commands
        const commands = Array.from(commandRegistry.getCommands().values()).map((cmd) => cmd.data.toJSON());
        const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);

        await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID), {
            body: commands,
        });
        debug.info('Slash commands registered successfully');

        // 5. Test GitHub connection
        const webhookConnected = await githubClient.testWebhookConnection();
        if (!webhookConnected) {
            logger.warn('GitHub API verification had warnings — verify token permissions');
        }

        // 6. Start HTTP server
        const app = createApp({
            client,
            webhookConnected,
            isDatabaseReady: () => mongoose.connection.readyState === 1,
        });

        server = app.listen(env.PORT, () => {
            logger.info(`🚀 OctoBot server running on port ${env.PORT}`);
            logger.info('Service Status:');
            logger.info('- Database: Connected');
            logger.info(`- Discord: ${client.isReady() ? 'Connected' : 'Disconnected'}`);
            logger.info(`- Webhook: ${webhookConnected ? 'Configured' : 'Not Configured'}`);
            logger.info(`- Liveness:  GET http://localhost:${env.PORT}/health`);
            logger.info(`- Readiness: GET http://localhost:${env.PORT}/ready`);
        });
    } catch (error) {
        logger.error('Failed to initialize services:', error);
        process.exit(1);
    }
};

// Register Discord event handlers
client.once('ready', () => {
    debug.info(`Bot is ready as ${client.user?.tag}`);
});

// Single interactionCreate handler
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    await commandRegistry.handleCommand(interaction);
});

// Start the application
initializeServices().catch((error) => {
    logger.error('Initialization error:', error);
    process.exit(1);
});
