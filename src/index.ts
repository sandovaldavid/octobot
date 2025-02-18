import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { REST, Routes } from 'discord.js';
import { connectDB } from '@config/databaseConfig';
import { discordClient } from '@config/discordConfig';
import { debug, logger } from '@utils/logger';
import { githubClient } from '@config/githubConfig';
import { commandRegistry } from '@commands/index';
import repositoryRoutes from '@routes/repositoryRoutes';
import issueRoutes from '@routes/issueRoutes';
import webhookRoutes from '@routes/webhookRoutes';

dotenv.config();

const client = discordClient.getClient();

const initializeServices = async () => {
    try {
        // Connect to database
        await connectDB();

        // Test Discord connection
        const discordConnected = await discordClient.testConnection();
        if (!discordConnected) {
            throw new Error('Failed to connect to Discord');
        }

        // Register slash commands
        const commands = Array.from(commandRegistry.getCommands().values()).map((cmd) => cmd.data.toJSON());
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);

        await rest.put(Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID!, process.env.DISCORD_GUILD_ID!), {
            body: commands,
        });
        debug.info('Slash commands registered successfully');

        // Test webhook connection
        const webhookConnected = await githubClient.testWebhookConnection();
        if (!webhookConnected) {
            logger.warn('Webhook configuration failed - Some notifications may not work');
        }

        // Setup Express server
        const app = express();
        const PORT = process.env.PORT || 4000;

        app.use(cors());
        app.use(express.json());

        // Routes
        app.use('/api', repositoryRoutes);
        app.use('/api', issueRoutes);
        app.use('/api', webhookRoutes);

        // Health check endpoint
        app.get('/health', (req, res) => {
            res.json({
                status: 'OK',
                timestamp: new Date().toISOString(),
                discord: client.isReady() ? 'Connected' : 'Disconnected',
                webhook: webhookConnected ? 'Configured' : 'Not Configured',
                database: 'Connected',
            });
        });

        // Start server
        app.listen(PORT, () => {
            logger.info(`Server running on port ${PORT}`);
            logger.info('Service Status:');
            logger.info('- Database: Connected');
            logger.info(`- Discord: ${client.isReady() ? 'Connected' : 'Disconnected'}`);
            logger.info(`- Webhook: ${webhookConnected ? 'Configured' : 'Not Configured'}`);
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
    await commandRegistry.handleCommand(interaction);
});

// Start the application
initializeServices().catch((error) => {
    logger.error('Initialization error:', error);
    process.exit(1);
});
