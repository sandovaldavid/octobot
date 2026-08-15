import { WebhookDeliveryModel, DeliveryStatus } from '@models/webhookDelivery';
import { ProcessingOutcome } from '@/pipeline/types';
import { debug } from '@utils/logger';

export const LEASE_DURATION_MS = 60 * 1000; // 60 seconds lease
export const RETENTION_PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days retention

export interface ClaimResult {
    claimed: boolean;
    isDuplicate: boolean;
    isReclaim?: boolean;
    isRetry?: boolean;
    status?: DeliveryStatus | 'in_flight';
    responseStatus?: number;
    outcome?: string;
}

export class DeliveryIdempotencyService {
    /**
     * Attempts to atomically establish an exclusive delivery claim for X-GitHub-Delivery.
     * Throws on systemic database errors to ensure fail-closed security.
     */
    static async claimDelivery(deliveryId: string, eventName: string): Promise<ClaimResult> {
        const now = new Date();
        const leaseExpiresAt = new Date(now.getTime() + LEASE_DURATION_MS);
        const expiresAt = new Date(now.getTime() + RETENTION_PERIOD_MS);

        try {
            // 1. Attempt initial atomic creation
            await WebhookDeliveryModel.create({
                deliveryId,
                eventName,
                status: 'processing',
                attemptCount: 1,
                firstReceivedAt: now,
                lastAttemptAt: now,
                processingStartedAt: now,
                leaseExpiresAt,
                expiresAt,
            });

            return {
                claimed: true,
                isDuplicate: false,
            };
        } catch (error: any) {
            // Check for MongoDB duplicate key error (code 11000)
            const isDuplicateKey = error?.code === 11000 || error?.name === 'MongoServerError';
            if (!isDuplicateKey) {
                debug.error(`Idempotency database error for delivery ${deliveryId}:`, error);
                throw error; // Fail closed
            }

            // 2. Handle duplicate delivery
            const existing = await WebhookDeliveryModel.findOne({ deliveryId });
            if (!existing) {
                throw new Error(`Failed to retrieve existing delivery record for ${deliveryId}`);
            }

            // A. Completed delivery -> suppress processing
            if (existing.status === 'completed') {
                return {
                    claimed: false,
                    isDuplicate: true,
                    status: 'completed',
                    responseStatus: 200,
                    outcome: existing.finalOutcome || 'ignored_duplicate',
                };
            }

            // B. Rejected delivery (e.g. malformed payload) -> suppress processing
            if (existing.status === 'rejected') {
                return {
                    claimed: false,
                    isDuplicate: true,
                    status: 'rejected',
                    responseStatus: 400,
                    outcome: existing.finalOutcome || 'ignored_duplicate_rejected',
                };
            }

            // C. In-flight processing
            if (existing.status === 'processing') {
                const isLeaseActive = existing.leaseExpiresAt && existing.leaseExpiresAt.getTime() > Date.now();

                if (isLeaseActive) {
                    return {
                        claimed: false,
                        isDuplicate: true,
                        status: 'in_flight',
                        responseStatus: 202,
                        outcome: 'ignored_duplicate_in_flight',
                    };
                }

                // Expired lease -> attempt atomic reclaim
                const reclaimed = await WebhookDeliveryModel.findOneAndUpdate(
                    {
                        deliveryId,
                        status: 'processing',
                        leaseExpiresAt: { $lte: new Date() },
                    },
                    {
                        $set: {
                            processingStartedAt: new Date(),
                            leaseExpiresAt: new Date(Date.now() + LEASE_DURATION_MS),
                            lastAttemptAt: new Date(),
                        },
                        $inc: { attemptCount: 1 },
                    },
                    { new: true }
                );

                if (reclaimed) {
                    debug.warn(`Reclaimed expired processing lease for delivery ${deliveryId}`);
                    return {
                        claimed: true,
                        isDuplicate: false,
                        isReclaim: true,
                    };
                }

                // Lost race to reclaim
                return {
                    claimed: false,
                    isDuplicate: true,
                    status: 'in_flight',
                    responseStatus: 202,
                    outcome: 'ignored_duplicate_in_flight',
                };
            }

            // D. Retryable failed delivery -> attempt atomic retry reclaim
            if (existing.status === 'retryable_failed') {
                const reclaimed = await WebhookDeliveryModel.findOneAndUpdate(
                    {
                        deliveryId,
                        status: 'retryable_failed',
                    },
                    {
                        $set: {
                            status: 'processing',
                            processingStartedAt: new Date(),
                            leaseExpiresAt: new Date(Date.now() + LEASE_DURATION_MS),
                            lastAttemptAt: new Date(),
                        },
                        $inc: { attemptCount: 1 },
                    },
                    { new: true }
                );

                if (reclaimed) {
                    debug.info(`Reclaiming retryable_failed delivery for retry: ${deliveryId}`);
                    return {
                        claimed: true,
                        isDuplicate: false,
                        isRetry: true,
                    };
                }

                return {
                    claimed: false,
                    isDuplicate: true,
                    status: 'in_flight',
                    responseStatus: 202,
                    outcome: 'ignored_duplicate_in_flight',
                };
            }

            return {
                claimed: false,
                isDuplicate: true,
                status: existing.status,
                responseStatus: 200,
                outcome: 'ignored_duplicate',
            };
        }
    }

    /**
     * Finalizes the delivery state after processing has concluded.
     */
    static async finalizeDelivery(
        deliveryId: string,
        outcome: ProcessingOutcome,
        responseStatus: number
    ): Promise<void> {
        let status: DeliveryStatus;

        if (outcome === 'invalid_payload') {
            status = 'rejected';
        } else if (outcome === 'failed') {
            status = 'retryable_failed';
        } else {
            // delivered, partial_delivery, ignored_ping, ignored_unsupported_event,
            // ignored_no_subscription, ignored_subscription_filter, ignored_policy
            status = 'completed';
        }

        try {
            await WebhookDeliveryModel.findOneAndUpdate(
                { deliveryId },
                {
                    $set: {
                        status,
                        completedAt: new Date(),
                        finalOutcome: outcome,
                        responseStatus,
                    },
                }
            );
        } catch (error) {
            debug.error(`Failed to finalize delivery state for ${deliveryId}:`, error);
        }
    }
}
