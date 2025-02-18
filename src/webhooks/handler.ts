import { WebhookModel } from '@models/webhook';
import { RepositoryModel } from '@models/repository';
import { discordService } from '@services/discordService';
import { webhookService } from '@services/github/webhookService';
import { debug } from '@utils/logger';
import { DiscordColors } from '@types/discordTypes';

// Event handlers
const handlers = {
    push: handlePushEvent,
    pull_request: handlePullRequestEvent,
    issues: handleIssueEvent,
    release: handleReleaseEvent,
    create: handleCreateEvent,
    delete: handleDeleteEvent,
    // workflow_run: handleWorkflowRunEvent,
    // workflow_job: handleWorkflowJobEvent,
    // check_run: handleCheckRunEvent,
    // deployment: handleDeploymentEvent,
    // deployment_status: handleDeploymentStatusEvent,
    // status: handleStatusEvent,
};

export const handleGithubWebhook = async (event: string, payload: any) => {
    try {
        await WebhookModel.create({
            type: event,
            repositoryName: payload.repository.full_name,
            payload,
        });

        const handler = handlers[event as keyof typeof handlers];
        if (handler) {
            const channelId = process.env.DISCORD_CHANNEL_ID;
            await handler(channelId, payload);
            debug.info(`Processed ${event} webhook for ${payload.repository.full_name}`);
        } else {
            debug.warn(`No handler found for event type: ${event}`);
        }
    } catch (error) {
        debug.error('Error handling webhook:', error);
        throw error;
    }
};

async function handlePushEvent(channelId: string, payload: any) {
    const notification = discordService.createGithubNotification({
        type: 'commit',
        action: 'pushed',
        title: `New Commits to ${payload.repository.full_name}`,
        description: `${payload.commits.length} new commits pushed to ${payload.ref}`,
        url: payload.compare,
        author: {
            name: payload.pusher.name,
            avatar: payload.sender.avatar_url,
        },
        fields: payload.commits.map((commit) => ({
            name: commit.id.substring(0, 7),
            value: commit.message,
        })),
        color: DiscordColors.SUCCESS,
    });

    await discordService.sendNotification(channelId, notification);
}

async function handlePullRequestEvent(channelId: string, payload: any) {
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

async function handleIssueEvent(channelId: string, payload: any) {
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
                value: issue.labels.map((label) => label.name).join(', ') || 'No labels',
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

async function handleReleaseEvent(channelId: string, payload: any) {
    const action = payload.action;
    const release = payload.release;

    const notification = discordService.createGithubNotification({
        type: 'release',
        action: action,
        title: `New Release: ${release.tag_name}`,
        description: release.body?.substring(0, 200) || 'No description provided',
        url: release.html_url,
        author: {
            name: release.author.login,
            avatar: release.author.avatar_url,
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

export const handleRepositoryWebhook = async (repoName: string) => {
    try {
        const repository = await RepositoryModel.findOne({ name: repoName });
        if (!repository) {
            throw new Error(`Repository ${repoName} not found`);
        }

        // Configure webhook for the repository
        const webhookResult = await webhookService.configureWebhook(repoName);
        if (!webhookResult.success) {
            throw new Error(`Failed to configure webhook: ${webhookResult.error}`);
        }

        // Update repository webhook status
        await RepositoryModel.findOneAndUpdate(
            { name: repoName },
            {
                webhookActive: true,
                webhookSettings: {
                    events: ['push', 'pull_request', 'issues', 'release', 'create', 'delete'],
                    channelId: process.env.DISCORD_CHANNEL_ID,
                },
            }
        );

        debug.info(`Webhook configured successfully for repository: ${repoName}`);
        return {
            success: true,
            message: `Webhook configured for ${repoName}`,
        };
    } catch (error) {
        debug.error('Error configuring repository webhook:', error);
        throw error;
    }
};
