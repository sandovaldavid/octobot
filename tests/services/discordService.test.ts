import { describe, expect, it } from 'bun:test';
import { discordService } from '../../src/services/discordService';
import { DiscordColors } from '../../src/types/discord';

describe('DiscordService - createGithubNotification', () => {
    it('debe asignar color SUCCESS para eventos de commit', () => {
        const notification = discordService.createGithubNotification({
            type: 'commit',
            action: 'pushed',
            title: 'New Commits',
            description: '3 commits pushed',
            url: 'https://github.com/user/repo/compare/123...456',
            author: { name: 'octocat', avatar: 'https://avatar.url' },
        });

        expect(notification.color).toBe(DiscordColors.SUCCESS);
        expect(notification.footer.text).toBe('GitHub commit - pushed');
    });

    it('debe asignar color PR_MERGED para PRs fusionadas', () => {
        const notification = discordService.createGithubNotification({
            type: 'pull_request',
            action: 'merged',
            title: 'PR #1 Merged',
            description: 'Feature merged into main',
            url: 'https://github.com/user/repo/pull/1',
            author: { name: 'octocat' },
        });

        expect(notification.color).toBe(DiscordColors.PR_MERGED);
        expect(notification.footer.text).toBe('GitHub pull_request - merged');
    });

    it('debe asignar color ISSUE_OPEN e ISSUE_CLOSED correctamente', () => {
        const openIssue = discordService.createGithubNotification({
            type: 'issue',
            action: 'opened',
            title: 'Bug Report',
            description: 'Something failed',
            url: 'https://github.com/user/repo/issues/10',
            author: { name: 'octocat' },
        });
        expect(openIssue.color).toBe(DiscordColors.ISSUE_OPEN);

        const closedIssue = discordService.createGithubNotification({
            type: 'issue',
            action: 'closed',
            title: 'Bug Report Fixed',
            description: 'Resolved',
            url: 'https://github.com/user/repo/issues/10',
            author: { name: 'octocat' },
        });
        expect(closedIssue.color).toBe(DiscordColors.ISSUE_CLOSED);
    });

    it('debe manejar la creación y eliminación de ramas', () => {
        const branchCreated = discordService.createGithubNotification({
            type: 'create',
            action: 'branch',
            title: 'Branch Created',
            description: 'feature-x',
            url: 'https://github.com/user/repo',
            author: { name: 'octocat' },
        });
        expect(branchCreated.color).toBe(DiscordColors.BRANCH);

        const branchDeleted = discordService.createGithubNotification({
            type: 'delete',
            action: 'branch',
            title: 'Branch Deleted',
            description: 'feature-x',
            url: 'https://github.com/user/repo',
            author: { name: 'octocat' },
        });
        expect(branchDeleted.color).toBe(DiscordColors.ERROR);
    });
});
