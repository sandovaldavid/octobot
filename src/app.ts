import cors from 'cors';
import express from 'express';
import issueRoutes from '@routes/issueRoutes';
import webhookRoutes from '@routes/webhookRoutes';

interface AppDependencies {
    client: {
        isReady(): boolean;
    };
    webhookConnected: boolean;
    databaseConnected?: boolean;
}

export function createApp({ client, webhookConnected, databaseConnected = true }: AppDependencies) {
    const app = express();

    app.use(cors());
    app.use(
        express.json({
            verify: (req: any, _res, buf) => {
                req.rawBody = Buffer.from(buf);
            },
        })
    );

    // Public HTTP surface intentionally excludes repository administration.
    app.use('/api/issues', issueRoutes);
    app.use('/api/webhooks', webhookRoutes);

    app.get('/health', (_req, res) => {
        res.json({
            status: 'OK',
            timestamp: new Date().toISOString(),
            discord: client.isReady() ? 'Connected' : 'Disconnected',
            webhook: webhookConnected ? 'Configured' : 'Not Configured',
            database: databaseConnected ? 'Connected' : 'Disconnected',
        });
    });

    return app;
}
