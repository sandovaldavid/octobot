import { VerifiedGithubDelivery, ProcessingResult, ProcessingOutcome } from './types';
import { normalizeGithubEvent } from './normalizer';
import { SubscriptionRouter } from './router';
import { NotificationFactory } from './formatter';
import { DiscordDelivery } from './delivery';
import { logger, debug } from '@utils/logger';

export class EventProcessor {
    static async process(delivery: VerifiedGithubDelivery): Promise<ProcessingResult> {
        const startTime = Date.now();
        const { deliveryId, eventName } = delivery;

        try {
            // 1. Normalize
            const normalizedEvent = normalizeGithubEvent(delivery);

            // 2. Handle ping
            if (normalizedEvent.type === 'ping') {
                const durationMs = Date.now() - startTime;
                this.logOutcome({
                    deliveryId,
                    eventName,
                    outcome: 'ignored_ping',
                    matchedSubscriptions: 0,
                    attempted: 0,
                    succeeded: 0,
                    failed: 0,
                    durationMs,
                });
                return {
                    deliveryId,
                    eventName,
                    outcome: 'ignored_ping',
                    matchedSubscriptions: 0,
                    attempted: 0,
                    succeeded: 0,
                    failed: 0,
                    durationMs,
                };
            }

            // 3. Handle unsupported events
            if (normalizedEvent.type === 'unsupported') {
                const durationMs = Date.now() - startTime;
                this.logOutcome({
                    deliveryId,
                    eventName,
                    outcome: 'ignored_unsupported_event',
                    matchedSubscriptions: 0,
                    attempted: 0,
                    succeeded: 0,
                    failed: 0,
                    durationMs,
                });
                return {
                    deliveryId,
                    eventName,
                    outcome: 'ignored_unsupported_event',
                    matchedSubscriptions: 0,
                    attempted: 0,
                    succeeded: 0,
                    failed: 0,
                    durationMs,
                };
            }

            const repositoryFullName = normalizedEvent.repositoryFullName;

            // 4. Resolve Subscriptions
            const { matchedSubscriptionsCount, targetChannelIds } =
                await SubscriptionRouter.resolveTargetChannels(normalizedEvent);

            if (matchedSubscriptionsCount === 0) {
                const durationMs = Date.now() - startTime;
                this.logOutcome({
                    deliveryId,
                    eventName,
                    repositoryFullName,
                    outcome: 'ignored_no_subscription',
                    matchedSubscriptions: 0,
                    attempted: 0,
                    succeeded: 0,
                    failed: 0,
                    durationMs,
                });
                return {
                    deliveryId,
                    eventName,
                    repositoryFullName,
                    outcome: 'ignored_no_subscription',
                    matchedSubscriptions: 0,
                    attempted: 0,
                    succeeded: 0,
                    failed: 0,
                    durationMs,
                };
            }

            if (targetChannelIds.length === 0) {
                const durationMs = Date.now() - startTime;
                this.logOutcome({
                    deliveryId,
                    eventName,
                    repositoryFullName,
                    outcome: 'ignored_subscription_filter',
                    matchedSubscriptions: matchedSubscriptionsCount,
                    attempted: 0,
                    succeeded: 0,
                    failed: 0,
                    durationMs,
                });
                return {
                    deliveryId,
                    eventName,
                    repositoryFullName,
                    outcome: 'ignored_subscription_filter',
                    matchedSubscriptions: matchedSubscriptionsCount,
                    attempted: 0,
                    succeeded: 0,
                    failed: 0,
                    durationMs,
                };
            }

            // 5. Format Notification
            const notification = NotificationFactory.createNotification(normalizedEvent);
            if (!notification) {
                const durationMs = Date.now() - startTime;
                this.logOutcome({
                    deliveryId,
                    eventName,
                    repositoryFullName,
                    outcome: 'ignored_unsupported_event',
                    matchedSubscriptions: matchedSubscriptionsCount,
                    attempted: 0,
                    succeeded: 0,
                    failed: 0,
                    durationMs,
                });
                return {
                    deliveryId,
                    eventName,
                    repositoryFullName,
                    outcome: 'ignored_unsupported_event',
                    matchedSubscriptions: matchedSubscriptionsCount,
                    attempted: 0,
                    succeeded: 0,
                    failed: 0,
                    durationMs,
                };
            }

            // 6. Deliver to Discord
            const { attempted, succeeded, failed } = await DiscordDelivery.deliver(targetChannelIds, notification);

            const outcome: ProcessingOutcome =
                failed === 0 ? 'delivered' : succeeded > 0 ? 'partial_delivery' : 'failed';

            const durationMs = Date.now() - startTime;
            const result: ProcessingResult = {
                deliveryId,
                eventName,
                repositoryFullName,
                outcome,
                matchedSubscriptions: matchedSubscriptionsCount,
                attempted,
                succeeded,
                failed,
                durationMs,
            };

            this.logOutcome(result);
            return result;
        } catch (error) {
            const durationMs = Date.now() - startTime;
            const errorMsg = error instanceof Error ? error.message : 'Unknown processor error';
            debug.error(`Pipeline failure for delivery ${deliveryId}:`, error);

            const result: ProcessingResult = {
                deliveryId,
                eventName,
                outcome: 'failed',
                matchedSubscriptions: 0,
                attempted: 0,
                succeeded: 0,
                failed: 0,
                durationMs,
                error: errorMsg,
            };

            this.logOutcome(result);
            return result;
        }
    }

    private static logOutcome(result: ProcessingResult): void {
        logger.info(
            `[Pipeline] deliveryId=${result.deliveryId} event=${result.eventName} repo=${result.repositoryFullName || 'N/A'} outcome=${result.outcome} matched=${result.matchedSubscriptions} attempted=${result.attempted} succeeded=${result.succeeded} failed=${result.failed} durationMs=${result.durationMs}`
        );
    }
}
