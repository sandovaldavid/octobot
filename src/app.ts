import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import webhookRoutes from '@routes/webhookRoutes';

interface AppDependencies {
    client: {
        isReady(): boolean;
    };
    webhookConnected?: boolean;
    databaseConnected?: boolean;
    isDatabaseReady?: () => boolean;
}

export function createApp({
    client,
    webhookConnected = true,
    databaseConnected = true,
    isDatabaseReady,
}: AppDependencies) {
    const app = express();

    app.use(cors());
    app.use(
        express.json({
            verify: (req: any, _res, buf) => {
                req.rawBody = Buffer.from(buf);
            },
        })
    );

    // Public HTTP surface: webhook ingress, liveness, and readiness
    app.use('/api/webhooks', webhookRoutes);

    // 1. Liveness check: confirms the HTTP process is running
    app.get('/health', (_req, res) => {
        const isDbConnected = isDatabaseReady ? isDatabaseReady() : databaseConnected;
        res.status(200).json({
            status: 'OK',
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            discord: client.isReady() ? 'Connected' : 'Disconnected',
            webhook: webhookConnected ? 'Configured' : 'Not Configured',
            database: isDbConnected ? 'Connected' : 'Disconnected',
        });
    });

    // 2. Readiness check: confirms Discord gateway and MongoDB persistence are both UP
    app.get('/ready', (_req, res) => {
        const isDiscordUp = client.isReady();
        const isDbUp = isDatabaseReady ? isDatabaseReady() : mongoose.connection.readyState === 1 || databaseConnected;

        const isReady = isDiscordUp && isDbUp;
        const statusCode = isReady ? 200 : 503;

        res.status(statusCode).json({
            status: isReady ? 'READY' : 'UNREADY',
            timestamp: new Date().toISOString(),
            checks: {
                discord: isDiscordUp ? 'UP' : 'DOWN',
                database: isDbUp ? 'UP' : 'DOWN',
                webhook: webhookConnected ? 'UP' : 'DOWN',
            },
        });
    });

    return app;
}
