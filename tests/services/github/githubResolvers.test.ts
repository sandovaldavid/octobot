import { describe, expect, it, mock, spyOn, beforeEach, afterEach } from 'bun:test';
import { App } from 'octokit';
import { GitHubClientResolver } from '../../../src/services/github/githubClientResolver';
import { GitHubInstallationResolver } from '../../../src/services/github/githubInstallationResolver';
import { DiscordGuildConnectionModel } from '../../../src/models/discordGuildConnection';
import { GitHubInstallationModel } from '../../../src/models/githubInstallation';
import {
    GuildNotConnectedError,
    InstallationRevokedError,
    InstallationSuspendedError,
    RepositoryNotAccessibleError,
} from '../../../src/types/multiTenantErrors';

describe('Services - GitHub Resolvers', () => {
    describe('GitHubClientResolver', () => {
        it('should cache and reuse Octokit client for same installationId', async () => {
            const mockOctokit = { rest: { issues: {} } } as any;
            const mockApp = {
                getInstallationOctokit: mock(async () => mockOctokit),
            } as unknown as App;

            const resolver = new GitHubClientResolver(mockApp);
            const client1 = await resolver.forInstallation(1001);
            const client2 = await resolver.forInstallation(1001);

            expect(client1).toBe(mockOctokit);
            expect(client2).toBe(mockOctokit);
            expect(mockApp.getInstallationOctokit).toHaveBeenCalledTimes(1);
            expect(mockApp.getInstallationOctokit).toHaveBeenCalledWith(1001);
        });

        it('should retrieve different Octokit clients for different installationIds', async () => {
            const mockOctokit1 = { id: 1 } as any;
            const mockOctokit2 = { id: 2 } as any;
            const mockApp = {
                getInstallationOctokit: mock(async (instId: number) => {
                    return instId === 1001 ? mockOctokit1 : mockOctokit2;
                }),
            } as unknown as App;

            const resolver = new GitHubClientResolver(mockApp);
            const client1 = await resolver.forInstallation(1001);
            const client2 = await resolver.forInstallation(1002);

            expect(client1).toBe(mockOctokit1);
            expect(client2).toBe(mockOctokit2);
            expect(mockApp.getInstallationOctokit).toHaveBeenCalledTimes(2);
        });

        it('should invalidate cached client for specific installationId', async () => {
            const mockOctokit1 = { id: 'first' } as any;
            const mockOctokit2 = { id: 'second' } as any;
            let callCount = 0;
            const mockApp = {
                getInstallationOctokit: mock(async () => {
                    callCount++;
                    return callCount === 1 ? mockOctokit1 : mockOctokit2;
                }),
            } as unknown as App;

            const resolver = new GitHubClientResolver(mockApp);
            const client1 = await resolver.forInstallation(1001);
            expect(client1).toBe(mockOctokit1);
            expect(callCount).toBe(1);

            resolver.invalidate(1001);

            const client2 = await resolver.forInstallation(1001);
            expect(client2).toBe(mockOctokit2);
            expect(callCount).toBe(2);
        });

        it('should evict idle entries after idle TTL has elapsed', async () => {
            const mockOctokit = { id: 'test' } as any;
            const mockApp = {
                getInstallationOctokit: mock(async () => mockOctokit),
            } as unknown as App;

            // Use 50ms TTL for testing
            const resolver = new GitHubClientResolver(mockApp, { idleTtlMs: 50 });
            await resolver.forInstallation(1001);
            expect(mockApp.getInstallationOctokit).toHaveBeenCalledTimes(1);

            // Wait 60ms for TTL to expire
            await new Promise((resolve) => setTimeout(resolve, 60));

            // Requesting again should trigger eviction and fetch fresh client
            await resolver.forInstallation(1001);
            expect(mockApp.getInstallationOctokit).toHaveBeenCalledTimes(2);
        });

        it('should update access timestamp on reuse so active client is not evicted early', async () => {
            const mockOctokit = { id: 'test' } as any;
            const mockApp = {
                getInstallationOctokit: mock(async () => mockOctokit),
            } as unknown as App;

            // 100ms TTL
            const resolver = new GitHubClientResolver(mockApp, { idleTtlMs: 100 });
            await resolver.forInstallation(1001);
            expect(mockApp.getInstallationOctokit).toHaveBeenCalledTimes(1);

            // Access at 60ms to refresh lastUsedAt
            await new Promise((resolve) => setTimeout(resolve, 60));
            await resolver.forInstallation(1001);
            expect(mockApp.getInstallationOctokit).toHaveBeenCalledTimes(1);

            // Access at another 60ms (120ms from start, but 60ms from last access)
            await new Promise((resolve) => setTimeout(resolve, 60));
            await resolver.forInstallation(1001);
            expect(mockApp.getInstallationOctokit).toHaveBeenCalledTimes(1);
        });

        it('should enforce maxEntries capacity by evicting oldest entry', async () => {
            const mockApp = {
                getInstallationOctokit: mock(async (id: number) => ({ id })),
            } as unknown as App;

            // Max 2 entries
            const resolver = new GitHubClientResolver(mockApp, { maxEntries: 2, idleTtlMs: 100000 });
            await resolver.forInstallation(1);
            await resolver.forInstallation(2);
            expect(mockApp.getInstallationOctokit).toHaveBeenCalledTimes(2);

            // Accessing 3rd entry should evict oldest (1)
            await resolver.forInstallation(3);
            expect(mockApp.getInstallationOctokit).toHaveBeenCalledTimes(3);

            // 2 and 3 should still be cached
            await resolver.forInstallation(2);
            await resolver.forInstallation(3);
            expect(mockApp.getInstallationOctokit).toHaveBeenCalledTimes(3);

            // 1 was evicted, so accessing 1 will call getInstallationOctokit again
            await resolver.forInstallation(1);
            expect(mockApp.getInstallationOctokit).toHaveBeenCalledTimes(4);
        });
    });

    describe('GitHubInstallationResolver', () => {
        let findConnectionSpy: any;
        let findOneInstallationSpy: any;
        let findInstallationSpy: any;

        beforeEach(() => {
            findConnectionSpy = spyOn(DiscordGuildConnectionModel, 'find');
            findOneInstallationSpy = spyOn(GitHubInstallationModel, 'findOne');
            findInstallationSpy = spyOn(GitHubInstallationModel, 'find');
        });

        afterEach(() => {
            if (findConnectionSpy?.mockRestore) findConnectionSpy.mockRestore();
            if (findOneInstallationSpy?.mockRestore) findOneInstallationSpy.mockRestore();
            if (findInstallationSpy?.mockRestore) findInstallationSpy.mockRestore();
        });

        it('should throw GuildNotConnectedError when guild has no active connection', async () => {
            findConnectionSpy.mockReturnValue({
                lean: mock(async () => []),
            } as any);

            const resolver = new GitHubInstallationResolver();
            expect(resolver.resolveForGuild('guild-not-connected')).rejects.toThrow(GuildNotConnectedError);
        });

        it('should throw InstallationRevokedError when installation is not found in database', async () => {
            findConnectionSpy.mockReturnValue({
                lean: mock(async () => [{ guildId: 'guild-1', installationId: 5001, status: 'connected' }]),
            } as any);
            findOneInstallationSpy.mockReturnValue({
                lean: mock(async () => null),
            } as any);

            const resolver = new GitHubInstallationResolver();
            expect(resolver.resolveForGuild('guild-1')).rejects.toThrow(InstallationRevokedError);
        });

        it('should throw InstallationRevokedError when installation status is revoked', async () => {
            findConnectionSpy.mockReturnValue({
                lean: mock(async () => [{ guildId: 'guild-1', installationId: 5001, status: 'connected' }]),
            } as any);
            findOneInstallationSpy.mockReturnValue({
                lean: mock(async () => ({
                    installationId: 5001,
                    accountId: 100,
                    accountLogin: 'octo-org',
                    accountType: 'Organization',
                    status: 'revoked',
                })),
            } as any);

            const resolver = new GitHubInstallationResolver();
            expect(resolver.resolveForGuild('guild-1')).rejects.toThrow(InstallationRevokedError);
        });

        it('should throw InstallationSuspendedError when installation status is suspended', async () => {
            findConnectionSpy.mockReturnValue({
                lean: mock(async () => [{ guildId: 'guild-1', installationId: 5001, status: 'connected' }]),
            } as any);
            findOneInstallationSpy.mockReturnValue({
                lean: mock(async () => ({
                    installationId: 5001,
                    accountId: 100,
                    accountLogin: 'octo-org',
                    accountType: 'Organization',
                    status: 'suspended',
                })),
            } as any);

            const resolver = new GitHubInstallationResolver();
            expect(resolver.resolveForGuild('guild-1')).rejects.toThrow(InstallationSuspendedError);
        });

        it('should successfully resolve active installation for connected guild', async () => {
            findConnectionSpy.mockReturnValue({
                lean: mock(async () => [{ guildId: 'guild-1', installationId: 5001, status: 'connected' }]),
            } as any);
            findOneInstallationSpy.mockReturnValue({
                lean: mock(async () => ({
                    installationId: 5001,
                    accountId: 100,
                    accountLogin: 'octo-org',
                    accountType: 'Organization',
                    status: 'active',
                    permissions: { issues: 'read' },
                    events: ['push'],
                })),
            } as any);

            const resolver = new GitHubInstallationResolver();
            const context = await resolver.resolveForGuild('guild-1');

            expect(context.installationId).toBe(5001);
            expect(context.accountId).toBe(100);
            expect(context.accountLogin).toBe('octo-org');
            expect(context.accountType).toBe('Organization');
            expect(context.status).toBe('active');
            expect(context.permissions).toEqual({ issues: 'read' });
            expect(context.events).toEqual(['push']);
        });

        it('should resolve specific installation when repositoryFullName matches among multiple connected installations', async () => {
            findConnectionSpy.mockReturnValue({
                lean: mock(async () => [
                    { guildId: 'guild-1', installationId: 5001, status: 'connected' },
                    { guildId: 'guild-1', installationId: 5002, status: 'connected' },
                ]),
            } as any);
            findInstallationSpy.mockReturnValue({
                lean: mock(async () => [
                    {
                        installationId: 5001,
                        accountId: 101,
                        accountLogin: 'org-alpha',
                        accountType: 'Organization',
                        status: 'active',
                    },
                    {
                        installationId: 5002,
                        accountId: 102,
                        accountLogin: 'org-beta',
                        accountType: 'Organization',
                        status: 'active',
                    },
                ]),
            } as any);

            const resolver = new GitHubInstallationResolver();
            const context = await resolver.resolveForGuild('guild-1', 'org-beta/my-project');

            expect(context.installationId).toBe(5002);
            expect(context.accountLogin).toBe('org-beta');
        });

        it('should list all active installations for guild', async () => {
            findConnectionSpy.mockReturnValue({
                lean: mock(async () => [
                    { guildId: 'guild-1', installationId: 5001, status: 'connected' },
                    { guildId: 'guild-1', installationId: 5002, status: 'connected' },
                ]),
            } as any);
            findInstallationSpy.mockReturnValue({
                lean: mock(async () => [
                    {
                        installationId: 5001,
                        accountId: 101,
                        accountLogin: 'org-alpha',
                        accountType: 'Organization',
                        status: 'active',
                    },
                    {
                        installationId: 5002,
                        accountId: 102,
                        accountLogin: 'org-beta',
                        accountType: 'Organization',
                        status: 'active',
                    },
                ]),
            } as any);

            const resolver = new GitHubInstallationResolver();
            const list = await resolver.listForGuild('guild-1');

            expect(list.length).toBe(2);
            expect(list[0].installationId).toBe(5001);
            expect(list[1].installationId).toBe(5002);
        });

        it('should return empty list if guild has no connections', async () => {
            findConnectionSpy.mockReturnValue({
                lean: mock(async () => []),
            } as any);

            const resolver = new GitHubInstallationResolver();
            const list = await resolver.listForGuild('guild-empty');

            expect(list).toEqual([]);
        });

        it('should filter out non-active installations from listForGuild', async () => {
            findConnectionSpy.mockReturnValue({
                lean: mock(async () => [
                    { guildId: 'guild-1', installationId: 5001, status: 'connected' },
                    { guildId: 'guild-1', installationId: 5002, status: 'connected' },
                    { guildId: 'guild-1', installationId: 5003, status: 'connected' },
                ]),
            } as any);
            findInstallationSpy.mockReturnValue({
                lean: mock(async () => [
                    {
                        installationId: 5001,
                        accountId: 101,
                        accountLogin: 'org-active',
                        accountType: 'Organization',
                        status: 'active',
                    },
                    {
                        installationId: 5002,
                        accountId: 102,
                        accountLogin: 'org-suspended',
                        accountType: 'Organization',
                        status: 'suspended',
                    },
                    {
                        installationId: 5003,
                        accountId: 103,
                        accountLogin: 'org-revoked',
                        accountType: 'Organization',
                        status: 'revoked',
                    },
                ]),
            } as any);

            const resolver = new GitHubInstallationResolver();
            const list = await resolver.listForGuild('guild-1');

            expect(list.length).toBe(1);
            expect(list[0].installationId).toBe(5001);
            expect(list[0].accountLogin).toBe('org-active');
        });

        it('should throw RepositoryNotAccessibleError when repositoryFullName owner does not match any connected installation', async () => {
            findConnectionSpy.mockReturnValue({
                lean: mock(async () => [
                    { guildId: 'guild-1', installationId: 5001, status: 'connected' },
                    { guildId: 'guild-1', installationId: 5002, status: 'connected' },
                ]),
            } as any);
            findInstallationSpy.mockReturnValue({
                lean: mock(async () => [
                    {
                        installationId: 5001,
                        accountId: 101,
                        accountLogin: 'org-alpha',
                        accountType: 'Organization',
                        status: 'active',
                    },
                    {
                        installationId: 5002,
                        accountId: 102,
                        accountLogin: 'org-beta',
                        accountType: 'Organization',
                        status: 'active',
                    },
                ]),
            } as any);

            const resolver = new GitHubInstallationResolver();
            expect(resolver.resolveForGuild('guild-1', 'other-org/some-repo')).rejects.toThrow(
                RepositoryNotAccessibleError
            );
        });

        it('should properly convert permissions Map to plain object', async () => {
            const permissionsMap = new Map<string, string>([
                ['pull_requests', 'write'],
                ['issues', 'read'],
            ]);

            findConnectionSpy.mockReturnValue({
                lean: mock(async () => [{ guildId: 'guild-1', installationId: 5001, status: 'connected' }]),
            } as any);
            findOneInstallationSpy.mockReturnValue({
                lean: mock(async () => ({
                    installationId: 5001,
                    accountId: 100,
                    accountLogin: 'octo-org',
                    accountType: 'Organization',
                    status: 'active',
                    permissions: permissionsMap,
                })),
            } as any);

            const resolver = new GitHubInstallationResolver();
            const context = await resolver.resolveForGuild('guild-1');

            expect(context.permissions).toEqual({
                pull_requests: 'write',
                issues: 'read',
            });
        });
    });
});
