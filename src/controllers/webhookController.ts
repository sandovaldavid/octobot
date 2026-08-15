import { Request, Response } from 'express';
import { handleGithubWebhook } from '@webhooks/handler';
import { debug } from '@utils/logger';

export const webhookController = {
    async handleWebhook(req: Request, res: Response): Promise<void> {
        try {
            const event = req.headers['x-github-event'] as string;
            debug.info(`Processing verified webhook event: ${event}`);

            await handleGithubWebhook(event, req.body);

            res.status(200).json({
                success: true,
                message: 'Webhook processed successfully',
            });
        } catch (error) {
            debug.error('Webhook processing error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to process webhook',
            });
        }
    },
};
