import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from '@config/databaseConfig';
import { discordClient } from '@config/discordConfig';
import { debug, logger } from '@utils/logger';
import { githubClient } from '@config/githubConfig';
import repositoryRoutes from '@routes/repositoryRoutes';
import issueRoutes from '@routes/issueRoutes';
import webhookRoutes from '@routes/webhookRoutes';
import { repositoryService } from '@services/github/repositoryService';

dotenv.config();

const initializeServices = async () => {
    try {
        await connectDB();

        const discordConnected = await discordClient.testConnection();
        if (!discordConnected) {
            throw new Error('Failed to connect to Discord');
        }

        const webhookConnected = await githubClient.testWebhookConnection();
        if (!webhookConnected) {
            logger.warn('Webhook configuration failed - Some notifications may not work');
        }

        const app = express();
        const PORT = process.env.PORT || 4000;

        app.use(cors());
        app.use(express.json());

        // Routes
        app.get('/', (req, res) => {
            res.status(200).json({
                status: 'success',
                message: 'OctoBot API',
                version: '1.0.0',
                docs: '/api-docs',
                favicon: '/favicon.ico',
                endpoints: {},
            });
        });

        app.get('/health', (req, res) => {
            res.json({
                status: 'OK',
                timestamp: new Date().toISOString(),
                discord: discordClient.getClient().isReady() ? 'Connected' : 'Disconnected',
                webhook: webhookConnected ? 'Configured' : 'Not Configured',
                database: 'Connected',
            });
        });

        app.use('/api', repositoryRoutes);
        app.use('/api', issueRoutes);
        app.use('/api', webhookRoutes);

        app.listen(PORT, () => {
            logger.info(`Server running on port ${PORT}`);
            logger.info('Service Status:');
            logger.info(`- Database: Connected`);
            logger.info(`- Discord: ${discordClient.getClient().isReady() ? 'Connected' : 'Disconnected'}`);
            logger.info(`- Webhook: ${webhookConnected ? 'Configured' : 'Not Configured'}`);
        });
    } catch (error) {
        logger.error('Failed to initialize services:', error);
        process.exit(1);
    }
};

initializeServices().catch((error) => {
    logger.error('Initialization error:', error);
    process.exit(1);
});
