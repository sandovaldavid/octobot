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
                const isReady = event.action === 'ready_for_review';
                const isReviewReq = event.action === 'review_requested';

                let title: string;
                let color: number;
                let statusText: string;

                if (isMerged) {
                    title = `🟢 PR #${event.prNumber} Merged: ${event.title}`;
                    color = DiscordColors.PR_MERGED;
                    statusText = 'Merged';
                } else if (isReady) {
                    title = `🟣 PR #${event.prNumber} Ready for Review: ${event.title}`;
                    color = DiscordColors.PR_OPEN;
                    statusText = 'Ready for Review';
                } else if (isReviewReq) {
                    title = `🔍 Review Requested on PR #${event.prNumber}: ${event.title}`;
                    color = DiscordColors.PR_OPEN;
                    statusText = 'Review Requested';
                } else if (event.action === 'reopened') {
                    title = `PR #${event.prNumber} Reopened: ${event.title}`;
                    color = DiscordColors.PR_OPEN;
                    statusText = 'Reopened';
                } else {
                    title = `PR #${event.prNumber} Opened: ${event.title}`;
                    color = DiscordColors.PR_OPEN;
                    statusText = 'Open';
                }

                const fields = [
                    {
                        name: 'Status',
                        value: statusText,
                        inline: true,
                    },
                    {
                        name: 'Branch',
                        value: `${event.headRef} → ${event.baseRef}`,
                        inline: true,
                    },
                    {
                        name: 'Changes',
                        value: `+${event.additions} -${event.deletions}${event.changedFiles !== undefined ? ` • ${event.changedFiles} files` : ''}`,
                        inline: true,
                    },
                ];

                if (isMerged && event.mergedBy) {
                    fields.push({
                        name: 'Merged by',
                        value: `@${event.mergedBy}`,
                        inline: true,
                    });
                }

                if (event.requestedReviewers.length > 0) {
                    fields.push({
                        name: 'Reviewers',
                        value: event.requestedReviewers.map((r) => `@${r}`).join(', '),
                        inline: true,
                    });
                }

                return discordService.createGithubNotification({
                    type: 'pull_request',
                    action: event.action,
                    title,
                    description: event.body.substring(0, 200) || 'No description provided',
                    url: event.htmlUrl,
                    author: {
                        name: event.userLogin,
                        avatar: event.userAvatar,
                    },
                    fields,
                    color,
                });
            }

            case 'pull_request_review': {
                const isApproved = event.reviewState === 'approved';

                const title = isApproved
                    ? `✅ PR #${event.prNumber} Approved: ${event.prTitle}`
                    : `🔴 Changes Requested on PR #${event.prNumber}: ${event.prTitle}`;

                const color = isApproved ? DiscordColors.SUCCESS : DiscordColors.ERROR;
                const statusText = isApproved ? 'Approved • Ready for merge' : 'Changes Requested';

                return discordService.createGithubNotification({
                    type: 'pull_request',
                    action: `review_${event.reviewState}`,
                    title,
                    description:
                        event.body?.substring(0, 200) ||
                        (isApproved ? 'Approved by reviewer' : 'Changes requested by reviewer'),
                    url: event.htmlUrl,
                    author: {
                        name: event.reviewerLogin,
                        avatar: event.reviewerAvatar,
                    },
                    fields: [
                        {
                            name: 'Review Status',
                            value: statusText,
                            inline: true,
                        },
                        {
                            name: 'Branch',
                            value: `${event.prHeadRef} → ${event.prBaseRef}`,
                            inline: true,
                        },
                        {
                            name: 'Reviewer',
                            value: `@${event.reviewerLogin}`,
                            inline: true,
                        },
                    ],
                    color,
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
                            value: event.assigneeLogin ? `@${event.assigneeLogin}` : 'Unassigned',
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
