import { NormalizedGithubEvent } from './types';
import { DiscordNotification, DiscordColors } from '@/types/discord';
import { discordService } from '@services/discordService';

export class NotificationFactory {
    static createNotification(event: NormalizedGithubEvent): DiscordNotification | null {
        switch (event.type) {
            case 'push': {
                const commits = event.commits || [];
                return discordService.createGithubNotification({
                    type: 'commit',
                    action: 'pushed',
                    title: `New Commits to ${event.repositoryFullName}`,
                    description: `${commits.length} new commit${commits.length === 1 ? '' : 's'} pushed to ${event.ref}`,
                    url: event.compareUrl,
                    author: {
                        name: event.pusherName,
                        avatar: event.senderAvatar,
                    },
                    fields: commits.slice(0, 10).map((c) => ({
                        name: c.id ? c.id.substring(0, 7) : 'Commit',
                        value: c.message || 'No message',
                    })),
                    color: DiscordColors.SUCCESS,
                });
            }

            case 'pull_request': {
                const isMerged = event.action === 'merged';
                return discordService.createGithubNotification({
                    type: 'pull_request',
                    action: event.action,
                    title: `Pull Request #${event.prNumber} ${isMerged ? 'Merged' : event.action}: ${event.title}`,
                    description: event.body.substring(0, 200) || 'No description provided',
                    url: event.htmlUrl,
                    author: {
                        name: event.userLogin,
                        avatar: event.userAvatar,
                    },
                    fields: [
                        {
                            name: 'Status',
                            value: isMerged ? 'Merged' : event.action,
                            inline: true,
                        },
                        {
                            name: 'Branch',
                            value: `${event.headRef} → ${event.baseRef}`,
                            inline: true,
                        },
                        {
                            name: 'Changes',
                            value: `+${event.additions} -${event.deletions}`,
                            inline: true,
                        },
                    ],
                    color: isMerged ? DiscordColors.PR_MERGED : DiscordColors.PR_OPEN,
                });
            }

            case 'issues': {
                return discordService.createGithubNotification({
                    type: 'issue',
                    action: event.action,
                    title: `Issue #${event.issueNumber} ${event.action}: ${event.title}`,
                    description: event.body.substring(0, 200) || 'No description provided',
                    url: event.htmlUrl,
                    author: {
                        name: event.userLogin,
                        avatar: event.userAvatar,
                    },
                    fields: [
                        {
                            name: 'Status',
                            value: event.state,
                            inline: true,
                        },
                        {
                            name: 'Labels',
                            value: event.labels.join(', ') || 'None',
                            inline: true,
                        },
                        {
                            name: 'Assignee',
                            value: event.assigneeLogin || 'Unassigned',
                            inline: true,
                        },
                    ],
                    color: event.action === 'closed' ? DiscordColors.ISSUE_CLOSED : DiscordColors.ISSUE_OPEN,
                });
            }

            case 'release': {
                return discordService.createGithubNotification({
                    type: 'release',
                    action: event.action,
                    title: `New Release in ${event.repositoryFullName}: ${event.tagName}`,
                    description: event.name || 'Release published',
                    url: event.htmlUrl,
                    author: {
                        name: event.authorLogin,
                        avatar: event.authorAvatar,
                    },
                    fields: [
                        {
                            name: 'Version',
                            value: event.tagName,
                            inline: true,
                        },
                        {
                            name: 'Status',
                            value: event.isPrerelease ? 'Pre-release' : 'Stable',
                            inline: true,
                        },
                        {
                            name: 'Published',
                            value: new Date(event.publishedAt).toLocaleDateString(),
                            inline: true,
                        },
                    ],
                    color: DiscordColors.DEFAULT,
                });
            }

            case 'create': {
                if (event.refType !== 'branch') return null;
                return discordService.createGithubNotification({
                    type: 'create',
                    action: 'branch',
                    title: `New Branch Created`,
                    description: `Branch \`${event.ref}\` was created in ${event.repositoryFullName}`,
                    url: `${event.htmlUrl}/tree/${event.ref}`,
                    author: {
                        name: event.senderLogin,
                        avatar: event.senderAvatar,
                    },
                    color: DiscordColors.BRANCH,
                });
            }

            case 'delete': {
                if (event.refType !== 'branch') return null;
                return discordService.createGithubNotification({
                    type: 'delete',
                    action: 'branch',
                    title: `Branch Deleted`,
                    description: `Branch \`${event.ref}\` was deleted from ${event.repositoryFullName}`,
                    url: event.htmlUrl,
                    author: {
                        name: event.senderLogin,
                        avatar: event.senderAvatar,
                    },
                    color: DiscordColors.ERROR,
                });
            }

            default:
                return null;
        }
    }
}
