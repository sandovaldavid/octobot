import { WebhookModel } from '@models/webhook';
import { discordService } from '@services/discordService';
import { debug } from '@utils/logger';

export const handleGithubWebhook = async (event: string, payload: any) => {
    try {
        await WebhookModel.create({
            type: event,
            repositoryName: payload.repository.full_name,
            payload,
        });

        const channelId = process.env.DISCORD_CHANNEL_ID;

        switch (event) {
            case 'push':
                await handlePushEvent(channelId, payload);
                break;
            case 'pull_request':
                await handlePullRequestEvent(channelId, payload);
                break;
            case 'issues':
                await handleIssueEvent(channelId, payload);
                break;
            case 'release':
                await handleReleaseEvent(channelId, payload);
                break;
            case 'create':
                if (payload.ref_type === 'branch') {
                    await handleBranchCreateEvent(channelId, payload);
                }
                break;
            case 'delete':
                if (payload.ref_type === 'branch') {
                    await handleBranchDeleteEvent(channelId, payload);
                }
                break;
        }
    } catch (error) {
        debug.error('Error handling webhook:', error);
    }
};

const handlePushEvent = async (channelId: string, payload: any) => {
    const notification = discordService.createGithubNotification({
        type: 'commit',
        action: 'pushed',
        title: `New Commits to ${payload.repository.full_name}`,
        description: `${payload.commits.length} new commits pushed`,
        url: payload.compare,
        author: {
            name: payload.pusher.name,
            avatar: payload.sender.avatar_url,
        },
        fields: payload.commits.map((commit) => ({
            name: commit.id.substring(0, 7),
            value: commit.message,
        })),
    });

    await discordService.sendNotification(channelId, notification);
};