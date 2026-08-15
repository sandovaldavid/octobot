import dotenv from 'dotenv';
import { REST, Routes } from 'discord.js';
import { connectDB } from '@config/databaseConfig';
import { discordClient } from '@config/discordConfig';
import { debug, logger } from '@utils/logger';
import { githubClient } from '@config/githubConfig';
import { commandRegistry } from '@commands/index';
import { createApp } from '@/app';

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

        const app = createApp({ client, webhookConnected });
        const PORT = process.env.PORT || 4000;

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
    if (!interaction.isChatInputCommand()) return;
    await commandRegistry.handleCommand(interaction);
});

// Start the application
initializeServices().catch((error) => {
    logger.error('Initialization error:', error);
    process.exit(1);
});
