import { RepositorySubscriptionModel } from '@models/subscription';
import { discordService } from '@services/discordService';
import { debug } from '@utils/logger';
import { DiscordColors } from '@/types/discord';
import { Payload, Commit, IssuePayload, ReleasePayload, PullRequestPayload, Release } from '@/types/github';
import { WebhookEventType } from '@/types/webhook';

// Event handlers
const handlers = {
    push: handlePushEvent,
    pull_request: handlePullRequestEvent,
    issues: handleIssueEvent,
    release: handleReleaseEvent,
    create: handleCreateEvent,
    delete: handleDeleteEvent,
};

export const handleGithubWebhook = async (event: string, payload: Payload) => {
    try {
        const handler = handlers[event as keyof typeof handlers];
        if (!handler) {
            debug.warn(`No handler found for event type: ${event}`);
            return;
        }

        const fullName = payload.repository.full_name?.toLowerCase();
        const shortName = payload.repository.name?.toLowerCase();

        // Find all active subscriptions for this repository
        const candidateNames = [fullName, shortName].filter(Boolean) as string[];
        const subscriptions = await RepositorySubscriptionModel.find({
            repositoryFullName: { $in: candidateNames },
            active: true,
        });

        if (subscriptions.length === 0) {
            debug.warn(`No active subscriptions found for repository: ${payload.repository.full_name}`);
            return;
        }

        for (const sub of subscriptions) {
            // Check if subscription filters for this event (or if all events subscribed)
            if (!sub.events || sub.events.length === 0 || sub.events.includes(event as WebhookEventType)) {
                await handler(sub.channelId, payload);
                debug.info(
                    `Processed ${event} webhook for ${payload.repository.full_name} in channel ${sub.channelId}`
                );
            }
        }
    } catch (error) {
        debug.error('Error handling webhook:', error);
        throw error;
    }
};

async function handlePushEvent(channelId: string, payload: Payload) {
    const commits = payload.commits || [];
    const notification = discordService.createGithubNotification({
        type: 'commit',
        action: 'pushed',
        title: `New Commits to ${payload.repository.full_name}`,
        description: `${commits.length} new commit${commits.length === 1 ? '' : 's'} pushed to ${payload.ref}`,
        url: payload.compare,
        author: {
            name: payload.pusher?.name || payload.sender?.avatar_url || 'GitHub',
            avatar: payload.sender?.avatar_url,
        },
        fields: commits.slice(0, 10).map((commit: Commit) => ({
            name: commit.id ? commit.id.substring(0, 7) : 'Commit',
            value: commit.message || 'No message',
        })),
        color: DiscordColors.SUCCESS,
    });

    await discordService.sendNotification(channelId, notification);
}

async function handlePullRequestEvent(channelId: string, payload: PullRequestPayload) {
    const action = payload.action;
    const pr = payload.pull_request;
    const isMerged = action === 'closed' && pr.merged;

    const notification = discordService.createGithubNotification({
        type: 'pull_request',
        action: isMerged ? 'merged' : action,
        title: `Pull Request ${isMerged ? 'Merged' : action}: ${pr.title}`,
        description: pr.body?.substring(0, 200) || 'No description provided',
        url: pr.html_url,
        author: {
            name: pr.user.login,
            avatar: pr.user.avatar_url,
        },
        fields: [
            {
                name: 'Status',
                value: isMerged ? 'Merged' : pr.state,
                inline: true,
            },
            {
                name: 'Branch',
                value: `${pr.head.ref} → ${pr.base.ref}`,
                inline: true,
            },
            {
                name: 'Changes',
                value: `+${pr.additions} -${pr.deletions}`,
                inline: true,
            },
        ],
        color: isMerged ? DiscordColors.SUCCESS : DiscordColors.WARNING,
    });

    await discordService.sendNotification(channelId, notification);
}

async function handleIssueEvent(channelId: string, payload: IssuePayload) {
    const action = payload.action;
    const issue = payload.issue;

    const notification = discordService.createGithubNotification({
        type: 'issue',
        action: action,
        title: `Issue ${action}: ${issue.title}`,
        description: issue.body?.substring(0, 200) || 'No description provided',
        url: issue.html_url,
        author: {
            name: issue.user.login,
            avatar: issue.user.avatar_url,
        },
        fields: [
            {
                name: 'Status',
                value: issue.state,
                inline: true,
            },
            {
                name: 'Labels',
                value: issue.labels.map((label: { name: string }) => label.name).join(', ') || 'No labels',
                inline: true,
            },
            {
                name: 'Assignee',
                value: issue.assignee ? issue.assignee.login : 'Unassigned',
                inline: true,
            },
        ],
        color: DiscordColors.INFO,
    });

    await discordService.sendNotification(channelId, notification);
}

async function handleReleaseEvent(channelId: string, payload: ReleasePayload) {
    const action = payload.action;
    const release: Release = payload.release;

    const notification = discordService.createGithubNotification({
        type: 'release',
        action: action,
        title: `New Release: ${release.tag_name}`,
        description: 'No description provided',
        url: release.html_url,
        author: {
            name: 'Unknown author',
            avatar: '',
        },
        fields: [
            {
                name: 'Version',
                value: release.tag_name,
                inline: true,
            },
            {
                name: 'Status',
                value: release.prerelease ? 'Pre-release' : 'Stable',
                inline: true,
            },
            {
                name: 'Published',
                value: new Date(release.published_at).toLocaleDateString(),
                inline: true,
            },
        ],
        color: DiscordColors.DEFAULT,
    });

    await discordService.sendNotification(channelId, notification);
}

async function handleCreateEvent(channelId: string, payload: any) {
    if (payload.ref_type !== 'branch') return;

    const notification = discordService.createGithubNotification({
        type: 'create',
        action: 'branch',
        title: `New Branch Created`,
        description: `Branch ${payload.ref} was created in ${payload.repository.full_name}`,
        url: `${payload.repository.html_url}/tree/${payload.ref}`,
        author: {
            name: payload.sender.login,
            avatar: payload.sender.avatar_url,
        },
        color: DiscordColors.BRANCH,
    });

    await discordService.sendNotification(channelId, notification);
}

async function handleDeleteEvent(channelId: string, payload: any) {
    if (payload.ref_type !== 'branch') return;

    const notification = discordService.createGithubNotification({
        type: 'delete',
        action: 'branch',
        title: `Branch Deleted`,
        description: `Branch ${payload.ref} was deleted from ${payload.repository.full_name}`,
        url: payload.repository.html_url,
        author: {
            name: payload.sender.login,
            avatar: payload.sender.avatar_url,
        },
        color: DiscordColors.ERROR,
    });

    await discordService.sendNotification(channelId, notification);
}
