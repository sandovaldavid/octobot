import { RepositorySubscriptionModel } from '@models/subscription';
import { NormalizedGithubEvent } from './types';
import { SupportedWebhookEvent } from '@/types/webhook';
import { debug } from '@utils/logger';

export interface RouteResolution {
    matchedSubscriptionsCount: number;
    targetChannelIds: string[];
}

export class SubscriptionRouter {
    static async resolveTargetChannels(event: NormalizedGithubEvent): Promise<RouteResolution> {
        if (event.type === 'ping' || event.type === 'unsupported' || !event.repositoryFullName) {
            return { matchedSubscriptionsCount: 0, targetChannelIds: [] };
        }

        const repoFullName = event.repositoryFullName.toLowerCase();

        // Canonical owner/repo exact matching
        const subscriptions = await RepositorySubscriptionModel.find({
            repositoryFullName: repoFullName,
            active: true,
        });

        if (subscriptions.length === 0) {
            debug.info(`No active subscriptions found for repository: ${repoFullName}`);
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
