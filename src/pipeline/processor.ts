import { VerifiedGithubDelivery, ProcessingResult, ProcessingOutcome } from './types';
import { normalizeGithubEvent } from './normalizer';
import { NotificationPolicy } from './policy';
import { SubscriptionRouter, RouteDependencies } from './router';
import { NotificationFactory } from './formatter';
import { DiscordDelivery } from './delivery';
import { WorkflowStateService } from '../services/workflowStateService';
import { logger, debug } from '../utils/logger';
import { GitHubInstallationModel } from '../models/githubInstallation';
import { DiscordGuildConnectionModel } from '../models/discordGuildConnection';
import { SubscriptionModel } from '../models/subscription';
import { IGitHubClientResolver } from '../services/github/githubClientResolver';

export interface EventProcessorDependencies {
    clientResolver?: IGitHubClientResolver;
    installationModel?: typeof GitHubInstallationModel;
    guildConnModel?: typeof DiscordGuildConnectionModel;
    subModel?: typeof SubscriptionModel;
    routerDeps?: RouteDependencies;
}

export class EventProcessor {
    private static defaultClientResolver: IGitHubClientResolver | null = null;

    static setClientResolver(resolver: IGitHubClientResolver | null): void {
        this.defaultClientResolver = resolver;
    }

    static getClientResolver(): IGitHubClientResolver | null {
        return this.defaultClientResolver;
    }

    static async process(
        delivery: VerifiedGithubDelivery,
        deps?: EventProcessorDependencies
    ): Promise<ProcessingResult> {
        const startTime = Date.now();
        const { deliveryId, eventName } = delivery;

        try {
            // 0. Handle GitHub App Lifecycle Events
            if (eventName === 'installation' || eventName === 'installation_repositories') {
                return await this.handleLifecycleEvent(delivery, startTime, deps);
            }

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

            // 6. Resolve Subscriptions with Fail-Closed Verification
            const routerDeps: RouteDependencies | undefined =
                deps?.routerDeps ??
                (deps
                    ? {
                          subModel: deps.subModel,
                          guildConnModel: deps.guildConnModel,
                          instModel: deps.installationModel,
                      }
                    : undefined);

            const { matchedSubscriptionsCount, targetChannelIds } = await SubscriptionRouter.resolveTargetChannels(
                normalizedEvent,
                routerDeps
            );

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

    private static async handleLifecycleEvent(
        delivery: VerifiedGithubDelivery,
        startTime: number,
        deps?: EventProcessorDependencies
    ): Promise<ProcessingResult> {
        const { deliveryId, eventName, payload } = delivery;

        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            const result: ProcessingResult = {
                deliveryId,
                eventName,
                outcome: 'invalid_payload',
                matchedSubscriptions: 0,
                attempted: 0,
                succeeded: 0,
                failed: 0,
                durationMs: Date.now() - startTime,
                error: 'Payload must be a non-null JSON object',
            };
            this.logOutcome(result);
            return result;
        }

        const p = payload as Record<string, any>;
        const action = String(p.action || '');
        const rawInstallationId = p.installation?.id;
        const installationId = typeof rawInstallationId === 'number' ? rawInstallationId : Number(rawInstallationId);

        if (!installationId || isNaN(installationId) || installationId <= 0) {
            const result: ProcessingResult = {
                deliveryId,
                eventName,
                outcome: 'invalid_payload',
                matchedSubscriptions: 0,
                attempted: 0,
                succeeded: 0,
                failed: 0,
                durationMs: Date.now() - startTime,
                error: 'Missing or invalid installation.id in lifecycle event',
            };
            this.logOutcome(result);
            return result;
        }

        const instModel = deps?.installationModel ?? GitHubInstallationModel;
        const guildConnModel = deps?.guildConnModel ?? DiscordGuildConnectionModel;
        const subModel = deps?.subModel ?? SubscriptionModel;
        const clientResolver = deps?.clientResolver !== undefined ? deps.clientResolver : this.defaultClientResolver;

        if (eventName === 'installation') {
            switch (action) {
                case 'created': {
                    const accountId = Number(p.installation?.account?.id || p.installation?.target_id || 0);
                    const accountLogin = String(p.installation?.account?.login || '')
                        .toLowerCase()
                        .trim();
                    const accountType = p.installation?.account?.type || p.installation?.target_type || 'Organization';
                    const repositorySelection =
                        p.installation?.repository_selection === 'selected' || p.repository_selection === 'selected'
                            ? 'selected'
                            : 'all';
                    const permissions = p.installation?.permissions || {};
                    const events = Array.isArray(p.installation?.events) ? p.installation.events : [];

                    await instModel.findOneAndUpdate(
                        { installationId },
                        {
                            $set: {
                                installationId,
                                accountId,
                                accountLogin,
                                accountType,
                                repositorySelection,
                                permissions,
                                events,
                                status: 'active',
                            },
                        },
                        { upsert: true, new: true }
                    );
                    break;
                }

                case 'deleted': {
                    await instModel.findOneAndUpdate({ installationId }, { $set: { status: 'revoked' } });
                    await guildConnModel.updateMany({ installationId }, { $set: { status: 'disconnected' } });
                    if (clientResolver) {
                        clientResolver.invalidate(installationId);
                    }
                    break;
                }

                case 'suspend': {
                    await instModel.findOneAndUpdate({ installationId }, { $set: { status: 'suspended' } });
                    if (clientResolver) {
                        clientResolver.invalidate(installationId);
                    }
                    break;
                }

                case 'unsuspend': {
                    await instModel.findOneAndUpdate({ installationId }, { $set: { status: 'active' } });
                    break;
                }

                default:
                    debug.info(`Unhandled installation action "${action}" for installation ${installationId}`);
                    break;
            }

            const result: ProcessingResult = {
                deliveryId,
                eventName,
                outcome: 'succeeded',
                matchedSubscriptions: 0,
                attempted: 0,
                succeeded: 0,
                failed: 0,
                durationMs: Date.now() - startTime,
            };
            this.logOutcome(result);
            return result;
        }

        if (eventName === 'installation_repositories') {
            const repositorySelection = p.repository_selection || p.installation?.repository_selection || 'selected';

            switch (action) {
                case 'added': {
                    await instModel.findOneAndUpdate({ installationId }, { $set: { repositorySelection } });
                    break;
                }

                case 'removed': {
                    const repositoriesRemoved = Array.isArray(p.repositories_removed) ? p.repositories_removed : [];
                    const removedRepoIds = repositoriesRemoved
                        .map((r: any) => (typeof r.id === 'number' ? r.id : Number(r.id)))
                        .filter((id: number) => !isNaN(id) && id > 0);

                    if (removedRepoIds.length > 0) {
                        await subModel.updateMany(
                            {
                                installationId,
                                repositoryId: { $in: removedRepoIds },
                            },
                            { $set: { active: false } }
                        );
                    }

                    await instModel.findOneAndUpdate({ installationId }, { $set: { repositorySelection } });

                    // Reconcile when repository selection is 'selected' and clientResolver is available
                    if (
                        clientResolver &&
                        (repositorySelection === 'selected' || p.repository_selection === 'selected')
                    ) {
                        try {
                            const client = await clientResolver.forInstallation(installationId);
                            if (client && client.rest?.apps?.listReposAccessibleToInstallation) {
                                const accessibleRepoIds = new Set<number>();
                                let page = 1;
                                let hasMore = true;

                                while (hasMore) {
                                    const res = await client.rest.apps.listReposAccessibleToInstallation({
                                        per_page: 100,
                                        page,
                                    });
                                    const repos = res.data?.repositories || [];
                                    for (const repo of repos) {
                                        if (typeof repo.id === 'number') {
                                            accessibleRepoIds.add(repo.id);
                                        }
                                    }
                                    const totalCount = res.data?.total_count || repos.length;
                                    if (repos.length < 100 || accessibleRepoIds.size >= totalCount) {
                                        hasMore = false;
                                    } else {
                                        page++;
                                    }
                                }

                                const activeSubs = await subModel.find({ installationId, active: true });
                                const orphaned = activeSubs.filter(
                                    (s: any) => s.repositoryId && !accessibleRepoIds.has(s.repositoryId)
                                );
                                if (orphaned.length > 0) {
                                    await subModel.updateMany(
                                        { _id: { $in: orphaned.map((s: any) => s._id) } },
                                        { $set: { active: false } }
                                    );
                                }
                            }
                        } catch (error) {
                            debug.error(
                                `Failed to reconcile accessible repositories for installation ${installationId}:`,
                                error
                            );
                            const errorMsg = error instanceof Error ? error.message : 'Reconciliation failed';
                            const result: ProcessingResult = {
                                deliveryId,
                                eventName,
                                outcome: 'failed',
                                matchedSubscriptions: 0,
                                attempted: 0,
                                succeeded: 0,
                                failed: 1,
                                durationMs: Date.now() - startTime,
                                error: `Reconciliation failed: ${errorMsg}`,
                            };
                            this.logOutcome(result);
                            return result;
                        }
                    }
                    break;
                }

                default:
                    debug.info(
                        `Unhandled installation_repositories action "${action}" for installation ${installationId}`
                    );
                    break;
            }

            const result: ProcessingResult = {
                deliveryId,
                eventName,
                outcome: 'succeeded',
                matchedSubscriptions: 0,
                attempted: 0,
                succeeded: 0,
                failed: 0,
                durationMs: Date.now() - startTime,
            };
            this.logOutcome(result);
            return result;
        }

        const result: ProcessingResult = {
            deliveryId,
            eventName,
            outcome: 'ignored_unsupported_event',
            matchedSubscriptions: 0,
            attempted: 0,
            succeeded: 0,
            failed: 0,
            durationMs: Date.now() - startTime,
        };
        this.logOutcome(result);
        return result;
    }

    private static logOutcome(result: ProcessingResult): void {
        const errorInfo = result.error ? ` error="${result.error}"` : '';
        logger.info(
            `[Pipeline] deliveryId=${result.deliveryId} event=${result.eventName} repo=${result.repositoryFullName || 'N/A'} outcome=${result.outcome} matched=${result.matchedSubscriptions} attempted=${result.attempted} succeeded=${result.succeeded} failed=${result.failed} durationMs=${result.durationMs}${errorInfo}`
        );
    }
}
