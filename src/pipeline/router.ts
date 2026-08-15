import { SubscriptionModel, ISubscription } from '../models/subscription';
import { DiscordGuildConnectionModel } from '../models/discordGuildConnection';
import { GitHubInstallationModel } from '../models/githubInstallation';
import { NormalizedGithubEvent } from './types';
import { SupportedWebhookEvent } from '../types/webhook';
import { debug } from '../utils/logger';

export interface RouteResolution {
    matchedSubscriptionsCount: number;
    targetChannelIds: string[];
}

export interface RouteDependencies {
    subModel?: typeof SubscriptionModel;
    guildConnModel?: typeof DiscordGuildConnectionModel;
    instModel?: typeof GitHubInstallationModel;
}

export interface EventRoutingContext {
    repositoryId?: number;
    installationId?: number;
    repositoryFullName?: string;
    type?: string;
}

export async function routeEventToSubscriptions(
    event: EventRoutingContext,
    deps?: RouteDependencies
): Promise<ISubscription[]> {
    const subModel = deps?.subModel ?? SubscriptionModel;
    const guildConnModel = deps?.guildConnModel ?? DiscordGuildConnectionModel;
    const instModel = deps?.instModel ?? GitHubInstallationModel;

    const repoFullName = event.repositoryFullName?.toLowerCase().trim();
    const repositoryId = event.repositoryId;
    const installationId = event.installationId;

    if (!repositoryId && !repoFullName && !installationId) {
        return [];
    }

    let query: any;

    if (repositoryId && installationId) {
        query = { installationId, repositoryId, active: true };
    } else if (repositoryId) {
        query = { repositoryId, active: true };
    } else if (installationId && repoFullName) {
        query = { repositoryFullName: repoFullName, installationId, active: true };
    } else if (repoFullName) {
        query = { repositoryFullName: repoFullName, active: true };
    } else {
        query = { installationId, active: true };
    }

    const candidateSubscriptions = await subModel.find(query);
    if (!candidateSubscriptions || candidateSubscriptions.length === 0) {
        return [];
    }

    const verifiedSubscriptions: ISubscription[] = [];

    for (const sub of candidateSubscriptions) {
        if (!sub.active) {
            continue;
        }

        if (sub.installationId) {
            // Fail-closed 3-point check: Guild connection & GitHub Installation
            if (!sub.guildId) {
                continue;
            }

            const guildConnection = await guildConnModel.findOne({
                guildId: sub.guildId,
                installationId: sub.installationId,
                status: 'connected',
            });

            if (!guildConnection || guildConnection.status !== 'connected') {
                continue;
            }

            const installation = await instModel.findOne({
                installationId: sub.installationId,
                status: 'active',
            });

            if (!installation || installation.status !== 'active') {
                continue;
            }
        }

        verifiedSubscriptions.push(sub);
    }

    return verifiedSubscriptions;
}

export class SubscriptionRouter {
    static async resolveTargetChannels(
        event: NormalizedGithubEvent,
        deps?: RouteDependencies
    ): Promise<RouteResolution> {
        if (
            event.type === 'ping' ||
            event.type === 'unsupported' ||
            (!event.repositoryFullName && !event.repositoryId)
        ) {
            return { matchedSubscriptionsCount: 0, targetChannelIds: [] };
        }

        const subscriptions = await routeEventToSubscriptions(
            {
                repositoryId: event.repositoryId,
                installationId: event.installationId,
                repositoryFullName: event.repositoryFullName,
                type: event.type,
            },
            deps
        );

        if (subscriptions.length === 0) {
            debug.info(
                `No verified active subscriptions found for repository: ${event.repositoryFullName || event.repositoryId || 'N/A'}`
            );
            return { matchedSubscriptionsCount: 0, targetChannelIds: [] };
        }

        const eventType = event.type as SupportedWebhookEvent;
        const targetChannelIds: string[] = [];

        for (const sub of subscriptions) {
            const hasEventSubscribed = !sub.events || sub.events.length === 0 || sub.events.includes(eventType);

            if (hasEventSubscribed && sub.channelId && !targetChannelIds.includes(sub.channelId)) {
                targetChannelIds.push(sub.channelId);
            }
        }

        return {
            matchedSubscriptionsCount: subscriptions.length,
            targetChannelIds,
        };
    }
}
