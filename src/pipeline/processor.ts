import { VerifiedGithubDelivery, ProcessingResult, ProcessingOutcome } from './types';
import { normalizeGithubEvent } from './normalizer';
import { NotificationPolicy } from './policy';
import { SubscriptionRouter } from './router';
import { NotificationFactory } from './formatter';
import { DiscordDelivery } from './delivery';
import { WorkflowStateService } from '@services/workflowStateService';
import { logger, debug } from '@utils/logger';

export class EventProcessor {
    static async process(delivery: VerifiedGithubDelivery): Promise<ProcessingResult> {
        const startTime = Date.now();
        const { deliveryId, eventName } = delivery;

        try {
            // 1. Normalize and Validate
            const normResult = normalizeGithubEvent(delivery);

            if (!normResult.success) {
                const durationMs = Date.now() - startTime;
                const result: ProcessingResult = {
                    deliveryId,
                    eventName,
                    repositoryFullName: normResult.repositoryFullName,
                    outcome: 'invalid_payload',
                    matchedSubscriptions: 0,
                    attempted: 0,
                    succeeded: 0,
                    failed: 0,
                    durationMs,
                    error: normResult.reason,
                };
                this.logOutcome(result);
                return result;
            }

            const normalizedEvent = normResult.event;

            // 2. Handle ping
            if (normalizedEvent.type === 'ping') {
                const durationMs = Date.now() - startTime;
                const result: ProcessingResult = {
                    deliveryId,
                    eventName,
                    repositoryFullName: normalizedEvent.repositoryFullName,
                    outcome: 'ignored_ping',
                    matchedSubscriptions: 0,
                    attempted: 0,
                    succeeded: 0,
                    failed: 0,
                    durationMs,
                };
                this.logOutcome(result);
                return result;
            }

            // 3. Handle unsupported events
            if (normalizedEvent.type === 'unsupported') {
                const durationMs = Date.now() - startTime;
                const result: ProcessingResult = {
                    deliveryId,
                    eventName,
                    repositoryFullName: normalizedEvent.repositoryFullName,
                    outcome: 'ignored_unsupported_event',
                    matchedSubscriptions: 0,
                    attempted: 0,
                    succeeded: 0,
                    failed: 0,
                    durationMs,
                };
                this.logOutcome(result);
                return result;
            }

            const repositoryFullName = normalizedEvent.repositoryFullName;

            // 4. For workflow_run, evaluate state transitions and ordering
            if (normalizedEvent.type === 'workflow_run') {
                const transition = await WorkflowStateService.evaluateTransition({
                    repositoryFullName: normalizedEvent.repositoryFullName,
                    workflowId: normalizedEvent.workflowId,
                    headBranch: normalizedEvent.headBranch,
                    runId: normalizedEvent.runId,
                    runNumber: normalizedEvent.runNumber,
                    runAttempt: normalizedEvent.runAttempt,
                    action: normalizedEvent.action,
                    conclusion: normalizedEvent.conclusion,
                });

                normalizedEvent.alertType = transition.alertType;
                normalizedEvent.previousState = transition.previousState;
            }

            // 5. Apply Notification Policy (Filter Noise)
            const policyDecision = NotificationPolicy.shouldNotify(normalizedEvent);
            if (!policyDecision.notify) {
                const durationMs = Date.now() - startTime;
                const result: ProcessingResult = {
                    deliveryId,
                    eventName,
                    repositoryFullName,
                    outcome: 'ignored_policy',
                    matchedSubscriptions: 0,
                    attempted: 0,
                    succeeded: 0,
                    failed: 0,
                    durationMs,
                    error: policyDecision.reason,
                };
                this.logOutcome(result);
                return result;
            }

            // 6. Resolve Subscriptions
            const { matchedSubscriptionsCount, targetChannelIds } =
                await SubscriptionRouter.resolveTargetChannels(normalizedEvent);

            if (matchedSubscriptionsCount === 0) {
                const durationMs = Date.now() - startTime;
                const result: ProcessingResult = {
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
                this.logOutcome(result);
                return result;
            }

            if (targetChannelIds.length === 0) {
                const durationMs = Date.now() - startTime;
                const result: ProcessingResult = {
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
                this.logOutcome(result);
                return result;
            }

            // 7. Format Notification
            const notification = NotificationFactory.createNotification(normalizedEvent);
            if (!notification) {
                const durationMs = Date.now() - startTime;
                const result: ProcessingResult = {
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
                this.logOutcome(result);
                return result;
            }

            // 8. Deliver to Discord
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
        const errorInfo = result.error ? ` error="${result.error}"` : '';
        logger.info(
            `[Pipeline] deliveryId=${result.deliveryId} event=${result.eventName} repo=${result.repositoryFullName || 'N/A'} outcome=${result.outcome} matched=${result.matchedSubscriptions} attempted=${result.attempted} succeeded=${result.succeeded} failed=${result.failed} durationMs=${result.durationMs}${errorInfo}`
        );
    }
}
