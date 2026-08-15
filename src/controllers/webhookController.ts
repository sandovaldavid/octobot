import { Request, Response } from 'express';
import { EventProcessor } from '@/pipeline/processor';
import { VerifiedGithubDelivery } from '@/pipeline/types';
import { debug } from '@utils/logger';

export const webhookController = {
    async handleWebhook(req: Request, res: Response): Promise<void> {
        try {
            const eventName = req.headers['x-github-event'] as string;
            const deliveryId = (req.headers['x-github-delivery'] as string) || 'unknown-delivery';

            const delivery: VerifiedGithubDelivery = {
                deliveryId,
                eventName,
                receivedAt: new Date(),
                payload: req.body || {},
            };

            const result = await EventProcessor.process(delivery);

            if (result.outcome === 'failed' && result.error) {
                res.status(500).json({
                    success: false,
                    error: 'Failed to process webhook delivery',
                    deliveryId,
                    outcome: result.outcome,
                });
                return;
            }

            res.status(200).json({
                success: true,
                deliveryId,
                outcome: result.outcome,
                matchedSubscriptions: result.matchedSubscriptions,
                delivered: result.succeeded,
            });
        } catch (error) {
            debug.error('Webhook controller error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error processing webhook',
            });
        }
    },
};
