import { RepositorySubscriptionModel } from '@models/subscription';
import { SUPPORTED_WEBHOOK_EVENTS } from '@/types/webhook';
import { webhookService } from '@services/github/webhookService';
import { debug } from '@utils/logger';

export class SubscriptionService {
    /**
     * Reconciles all local repository subscriptions to ensure they include
     * the latest SUPPORTED_WEBHOOK_EVENTS and updates remote GitHub webhooks.
     */
    static async reconcileAllSubscriptions(): Promise<{
        updatedCount: number;
        reconfiguredCount: number;
    }> {
        const subscriptions = await RepositorySubscriptionModel.find({ active: true });
        let updatedCount = 0;
        let reconfiguredCount = 0;

        const uniqueRepos = new Set<string>();

        for (const sub of subscriptions) {
            sub.events = [...SUPPORTED_WEBHOOK_EVENTS];
            await sub.save();
            updatedCount++;
            uniqueRepos.add(sub.repositoryFullName);
        }

        for (const repo of uniqueRepos) {
            const res = await webhookService.configureWebhook(repo);
            if (res.success) {
                reconfiguredCount++;
            } else {
                debug.warn(`Failed to reconcile remote webhook for ${repo}: ${res.error}`);
            }
        }

        return { updatedCount, reconfiguredCount };
    }
}
