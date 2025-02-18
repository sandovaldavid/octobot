import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from '@config/databaseConfig';
import { discordClient } from '@config/discordConfig';
import { debug, httpLogger, logger } from '@utils/logger.ts';
import { repositoryService } from '@services/github/repositoryService';
import repositoryRoutes from '@routes/repositoryRoutes';
import issueRoutes from '@routes/issueRoutes';

dotenv.config();

connectDB();

const discordConnected = await discordClient.testConnection();

if (!discordConnected) {
    throw new Error('Failed to connect to Discord');
}

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

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

// API Routes
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.use('/api', repositoryRoutes);
app.use('/api', issueRoutes);

app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
});
