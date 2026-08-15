import { Request, Response } from 'express';
import { EventProcessor } from '@/pipeline/processor';
import { VerifiedGithubDelivery } from '@/pipeline/types';
import { DeliveryIdempotencyService } from '@services/deliveryIdempotencyService';
import { debug } from '@utils/logger';

export const webhookController = {
    async handleWebhook(req: Request, res: Response): Promise<void> {
        const eventName = req.headers['x-github-event'] as string;
        const deliveryId = (req.headers['x-github-delivery'] as string) || 'unknown-delivery';

        let claimResult;
        try {
            claimResult = await DeliveryIdempotencyService.claimDelivery(deliveryId, eventName);
        } catch (error) {
            debug.error(`Idempotency claim failed for delivery ${deliveryId}:`, error);
            res.status(503).json({
                success: false,
                error: 'Service temporarily unavailable: failed to establish delivery idempotency claim',
                deliveryId,
            });
            return;
        }

        // Duplicate delivery handling
        if (!claimResult.claimed) {
            res.status(claimResult.responseStatus || 200).json({
                success: true,
                deliveryId,
                outcome: claimResult.outcome || 'ignored_duplicate',
                status: claimResult.status,
                duplicate: true,
            });
            return;
        }

        try {
            const delivery: VerifiedGithubDelivery = {
                deliveryId,
                eventName,
                receivedAt: new Date(),
                payload: req.body || {},
            };

            const result = await EventProcessor.process(delivery);

            if (result.outcome === 'invalid_payload') {
                const status = 400;
                await DeliveryIdempotencyService.finalizeDelivery(deliveryId, result.outcome, status);
                res.status(status).json({
                    success: false,
                    error: result.error || 'Invalid or malformed webhook payload',
                    deliveryId,
                    outcome: result.outcome,
                });
                return;
            }

            if (result.outcome === 'failed' && result.error) {
                const status = 500;
                await DeliveryIdempotencyService.finalizeDelivery(deliveryId, result.outcome, status);
                res.status(status).json({
                    success: false,
                    error: 'Failed to process webhook delivery',
                    deliveryId,
                    outcome: result.outcome,
                });
                return;
            }

            const status = 200;
            await DeliveryIdempotencyService.finalizeDelivery(deliveryId, result.outcome, status);
            res.status(status).json({
                success: true,
                deliveryId,
                outcome: result.outcome,
                matchedSubscriptions: result.matchedSubscriptions,
                delivered: result.succeeded,
            });
        } catch (error) {
            debug.error('Webhook controller error:', error);
            await DeliveryIdempotencyService.finalizeDelivery(deliveryId, 'failed', 500);
            res.status(500).json({
                success: false,
                error: 'Internal server error processing webhook',
            });
        }
    },
};
