import { RepositorySubscriptionModel } from '@models/subscription';
import { DEFAULT_SUBSCRIPTION_EVENTS } from '@/types/webhook';
import { webhookService } from '@services/github/webhookService';
import { debug } from '@utils/logger';

export class SubscriptionService {
    /**
     * Reconciles all active repository subscriptions and re-syncs remote GitHub webhooks.
     * Preserves customized subscription event preferences, filling defaults only if empty.
     */
    static async reconcileAllSubscriptions(): Promise<{
        reconciledSubscriptionsCount: number;
        reconfiguredWebhooksCount: number;
    }> {
        const subscriptions = await RepositorySubscriptionModel.find({ active: true });
        let reconciledSubscriptionsCount = 0;
        let reconfiguredWebhooksCount = 0;

        const uniqueRepos = new Set<string>();

        for (const sub of subscriptions) {
            // Only populate defaults if events array is empty or undefined
            if (!sub.events || sub.events.length === 0) {
                sub.events = [...DEFAULT_SUBSCRIPTION_EVENTS];
                await sub.save();
            }
            reconciledSubscriptionsCount++;
            uniqueRepos.add(sub.repositoryFullName);
        }

        for (const repo of uniqueRepos) {
            const res = await webhookService.configureWebhook(repo);
            if (res.success) {
                reconfiguredWebhooksCount++;
            } else {
                debug.warn(`Failed to reconcile remote webhook for ${repo}: ${res.error}`);
            }
        }

        return { reconciledSubscriptionsCount, reconfiguredWebhooksCount };
    }
}
