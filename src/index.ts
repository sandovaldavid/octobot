import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from '@config/databaseConfig';
import { discordClient } from '@config/discordConfig';
import { debug, logger } from '@utils/logger';
import repositoryRoutes from '@routes/repositoryRoutes';
import issueRoutes from '@routes/issueRoutes';

dotenv.config();

const initializeServices = async () => {
    try {
        await connectDB();

        const discordConnected = await discordClient.testConnection();
        if (!discordConnected) {
            throw new Error('Failed to connect to Discord');
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
            });
        });

        app.use('/api', repositoryRoutes);
        app.use('/api', issueRoutes);

        app.listen(PORT, () => {
            logger.info(`Server running on port ${PORT}`);
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
