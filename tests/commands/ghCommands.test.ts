import { beforeEach, describe, expect, it, mock } from 'bun:test';
import {
    ApplicationIntegrationType,
    InteractionContextType,
    PermissionFlagsBits,
    PermissionsBitField,
} from 'discord.js';
import { DEPRECATION_NOTICE } from '@/services/discord/commandResponseDecorator';
import { ghCommand } from '@/commands/gh/index';
import { github } from '@/commands/github/index';
import { executeGhDispatcher, GhCommandDeps } from '@/commands/gh/dispatcher';

describe('Commands - Global /gh Surface & /github Deprecated Alias', () => {
    describe('Command Structure and Metadata', () => {
        it('should define canonical /gh command with correct contexts and integration types', () => {
            expect(ghCommand.data.name).toBe('gh');
            const json = ghCommand.data.toJSON();
            expect(json.contexts).toContain(InteractionContextType.Guild);
            expect(json.integration_types).toContain(ApplicationIntegrationType.GuildInstall);
        });

        it('should define all required subcommands and groups on /gh', () => {
            const json = ghCommand.data.toJSON();
            const optionNames = json.options.map((opt: any) => opt.name);

            expect(optionNames).toContain('connect');
            expect(optionNames).toContain('disconnect');
            expect(optionNames).toContain('status');
            expect(optionNames).toContain('repo');
            expect(optionNames).toContain('issues');

            const repoGroup = json.options.find((opt: any) => opt.name === 'repo');
            expect(repoGroup).toBeDefined();
            const repoSubcommands = repoGroup.options.map((opt: any) => opt.name);
            expect(repoSubcommands).toContain('watch');
            expect(repoSubcommands).toContain('unwatch');
            expect(repoSubcommands).toContain('check');

            const issuesGroup = json.options.find((opt: any) => opt.name === 'issues');
            expect(issuesGroup).toBeDefined();
            const issuesSubcommands = issuesGroup.options.map((opt: any) => opt.name);
            expect(issuesSubcommands).toContain('list');

            // Verify pulls list is NOT present
            const pullsGroup = json.options.find((opt: any) => opt.name === 'pulls');
            expect(pullsGroup).toBeUndefined();
        });

        it('should define /github alias command', () => {
            expect(github.data.name).toBe('github');
            expect(typeof github.execute).toBe('function');
        });
    });

    describe('Dispatcher & Subcommand Execution', () => {
        let mockDeps: GhCommandDeps;
        let mockInstallationResolver: any;
        let mockClientResolver: any;
        let mockOnboardingController: any;
        let mockSubscriptionModel: any;
        let mockGuildConnectionModel: any;

        const makeQuery = (data: any) => {
            const promise: any = Promise.resolve(data);
            promise.lean = () => Promise.resolve(data);
            return promise;
        };

        function createMockInteraction(overrides: Record<string, any> = {}) {
            const interaction: any = {
                commandName: 'gh',
                guildId: 'guild-1',
                channelId: 'chan-1',
                user: { id: 'user-1' },
                memberPermissions: new PermissionsBitField(0n),
                replied: false,
                deferred: false,
                reply: mock(async (payload: any) => {
                    interaction.replied = true;
                    return payload;
                }),
                deferReply: mock(async () => {
                    interaction.deferred = true;
                }),
                editReply: mock(async (payload: any) => {
                    interaction.replied = true;
                    return payload;
                }),
                options: {
                    getSubcommandGroup: () => null,
                    getSubcommand: () => 'status',
                    getString: () => null,
                    getInteger: () => null,
                },
                ...overrides,
            };
            return interaction;
        }

        beforeEach(() => {
            mockInstallationResolver = {
                resolveForGuild: mock(async () => ({
                    installationId: 1001,
                    accountId: 42,
                    accountLogin: 'octo-org',
                    accountType: 'Organization',
                    status: 'active',
                })),
                listForGuild: mock(async () => [
                    {
                        installationId: 1001,
                        accountId: 42,
                        accountLogin: 'octo-org',
                        accountType: 'Organization',
                        status: 'active',
                    },
                ]),
            };

            const mockOctokit = {
                rest: {
                    repos: {
                        get: mock(async ({ owner, repo }: any) => ({
                            data: {
                                id: 555,
                                full_name: `${owner}/${repo}`,
                                name: repo,
                                default_branch: 'main',
                            },
                        })),
                    },
                    issues: {
                        listForRepo: mock(async () => ({
                            data: [
                                {
                                    id: 1,
                                    number: 10,
                                    title: 'Test Issue 1',
                                    state: 'open',
                                    html_url: 'https://github.com/octo-org/test-repo/issues/10',
                                    user: { login: 'dev1' },
                                },
                            ],
                        })),
                    },
                },
            };

            mockClientResolver = {
                forInstallation: mock(async () => mockOctokit),
                invalidate: mock(() => {}),
            };

            mockOnboardingController = {
                createConnectUrl: mock(async () => 'https://github.com/apps/octobot/installations/new?state=testnonce'),
            };

            mockSubscriptionModel = {
                find: mock(() =>
                    makeQuery([
                        {
                            repositoryFullName: 'octo-org/test-repo',
                            channelId: 'chan-1',
                            events: ['issues', 'pull_request', 'push'],
                            active: true,
                        },
                    ])
                ),
                findOne: mock(() =>
                    makeQuery({
                        repositoryFullName: 'octo-org/test-repo',
                        channelId: 'chan-1',
                        events: ['issues', 'pull_request', 'push'],
                        active: true,
                    })
                ),
                findOneAndUpdate: mock(async () => ({ repositoryFullName: 'octo-org/test-repo' })),
                deleteOne: mock(async () => ({ deletedCount: 1 })),
            };

            mockGuildConnectionModel = {
                find: mock(() => makeQuery([{ guildId: 'guild-1', installationId: 1001, status: 'connected' }])),
                updateMany: mock(async () => ({ modifiedCount: 1 })),
            };

            mockDeps = {
                installationResolver: mockInstallationResolver,
                clientResolver: mockClientResolver,
                onboardingController: mockOnboardingController,
                subscriptionModel: mockSubscriptionModel,
                guildConnectionModel: mockGuildConnectionModel,
            };
        });

        it('should block non-admin from executing /gh connect', async () => {
            const mockInteraction = createMockInteraction({
                options: {
                    getSubcommandGroup: () => null,
                    getSubcommand: () => 'connect',
                },
                memberPermissions: new PermissionsBitField(0n),
            });

            await executeGhDispatcher(mockInteraction, false, mockDeps);

            expect(mockInteraction.reply).toHaveBeenCalledTimes(1);
            const callArg = mockInteraction.reply.mock.calls[0][0];
            expect(callArg.content).toContain('Manage Server');
            expect(callArg.ephemeral).toBe(true);
            expect(mockOnboardingController.createConnectUrl).not.toHaveBeenCalled();
        });

        it('should allow admin to execute /gh connect and return connection link', async () => {
            const mockInteraction = createMockInteraction({
                user: { id: 'admin-1' },
                options: {
                    getSubcommandGroup: () => null,
                    getSubcommand: () => 'connect',
                },
                memberPermissions: new PermissionsBitField(PermissionFlagsBits.ManageGuild),
            });

            await executeGhDispatcher(mockInteraction, false, mockDeps);

            expect(mockOnboardingController.createConnectUrl).toHaveBeenCalledWith('guild-1', 'admin-1');
            expect(mockInteraction.reply).toHaveBeenCalledTimes(1);
            const callArg = mockInteraction.reply.mock.calls[0][0];
            expect(callArg.ephemeral).toBe(true);
            expect(callArg.embeds.length).toBeGreaterThan(0);
            expect(callArg.components.length).toBeGreaterThan(0);
        });

        it('should execute /gh disconnect and update guild connection status', async () => {
            const mockInteraction = createMockInteraction({
                user: { id: 'admin-1' },
                options: {
                    getSubcommandGroup: () => null,
                    getSubcommand: () => 'disconnect',
                },
                memberPermissions: new PermissionsBitField(PermissionFlagsBits.Administrator),
            });

            await executeGhDispatcher(mockInteraction, false, mockDeps);

            expect(mockGuildConnectionModel.updateMany).toHaveBeenCalledWith(
                { guildId: 'guild-1' },
                { status: 'disconnected' }
            );
            expect(mockInteraction.reply).toHaveBeenCalledTimes(1);
            const callArg = mockInteraction.reply.mock.calls[0][0];
            expect(callArg.content).toContain('Disconnected');
        });

        it('should allow any guild member to execute /gh status', async () => {
            const mockInteraction = createMockInteraction({
                user: { id: 'member-1' },
                options: {
                    getSubcommandGroup: () => null,
                    getSubcommand: () => 'status',
                },
                memberPermissions: new PermissionsBitField(0n),
            });

            await executeGhDispatcher(mockInteraction, false, mockDeps);

            expect(mockInstallationResolver.listForGuild).toHaveBeenCalledWith('guild-1');
            expect(mockSubscriptionModel.find).toHaveBeenCalledWith({ guildId: 'guild-1', active: true });
            expect(mockInteraction.reply).toHaveBeenCalledTimes(1);
            const callArg = mockInteraction.reply.mock.calls[0][0];
            expect(callArg.embeds.length).toBe(1);
            const embedJson = callArg.embeds[0].toJSON ? callArg.embeds[0].toJSON() : callArg.embeds[0];
            expect(embedJson.title).toContain('Status');
        });

        it('should execute /gh repo watch for admin, verify repository accessibility and upsert subscription', async () => {
            const mockInteraction = createMockInteraction({
                user: { id: 'admin-1' },
                options: {
                    getSubcommandGroup: () => 'repo',
                    getSubcommand: () => 'watch',
                    getString: (name: string) => (name === 'name' ? 'octo-org/test-repo' : null),
                },
                memberPermissions: new PermissionsBitField(PermissionFlagsBits.ManageGuild),
            });

            await executeGhDispatcher(mockInteraction, false, mockDeps);

            expect(mockInteraction.deferReply).toHaveBeenCalledTimes(1);
            expect(mockInstallationResolver.resolveForGuild).toHaveBeenCalledWith('guild-1', 'octo-org/test-repo');
            expect(mockClientResolver.forInstallation).toHaveBeenCalledWith(1001);
            expect(mockSubscriptionModel.findOneAndUpdate).toHaveBeenCalled();
            expect(mockInteraction.editReply).toHaveBeenCalledTimes(1);
            const callArg = mockInteraction.editReply.mock.calls[0][0];
            expect(
                callArg.content ||
                    callArg.embeds?.[0]?.data?.title ||
                    callArg.embeds?.[0]?.title ||
                    JSON.stringify(callArg)
            ).toContain('Repository Watch Configured');
        });

        it('should handle /gh repo watch when repository is not accessible (404)', async () => {
            const octokitWith404 = {
                rest: {
                    repos: {
                        get: mock(async () => {
                            const err: any = new Error('Not Found');
                            err.status = 404;
                            throw err;
                        }),
                    },
                },
            };
            mockClientResolver.forInstallation = mock(async () => octokitWith404);

            const mockInteraction = createMockInteraction({
                user: { id: 'admin-1' },
                options: {
                    getSubcommandGroup: () => 'repo',
                    getSubcommand: () => 'watch',
                    getString: (name: string) => (name === 'name' ? 'octo-org/private-repo' : null),
                },
                memberPermissions: new PermissionsBitField(PermissionFlagsBits.ManageGuild),
            });

            await executeGhDispatcher(mockInteraction, false, mockDeps);

            expect(mockInteraction.editReply).toHaveBeenCalledTimes(1);
            const callArg = mockInteraction.editReply.mock.calls[0][0];
            expect(callArg.content).toContain('does not have access');
        });

        it('should execute /gh repo unwatch and remove channel subscription', async () => {
            const mockInteraction = createMockInteraction({
                user: { id: 'admin-1' },
                options: {
                    getSubcommandGroup: () => 'repo',
                    getSubcommand: () => 'unwatch',
                    getString: (name: string) => (name === 'name' ? 'test-repo' : null),
                },
                memberPermissions: new PermissionsBitField(PermissionFlagsBits.ManageGuild),
            });

            await executeGhDispatcher(mockInteraction, false, mockDeps);

            expect(mockSubscriptionModel.findOneAndUpdate).toHaveBeenCalled();
            expect(mockInteraction.editReply).toHaveBeenCalledTimes(1);
            const callArg = mockInteraction.editReply.mock.calls[0][0];
            expect(callArg.content).toContain('Stopped watching');
        });

        it('should execute /gh repo check and return composite health report', async () => {
            const mockInteraction = createMockInteraction({
                user: { id: 'member-1' },
                options: {
                    getSubcommandGroup: () => 'repo',
                    getSubcommand: () => 'check',
                    getString: (name: string) => (name === 'name' ? 'octo-org/test-repo' : null),
                },
                memberPermissions: new PermissionsBitField(0n),
            });

            await executeGhDispatcher(mockInteraction, false, mockDeps);

            expect(mockInteraction.editReply).toHaveBeenCalledTimes(1);
            const callArg = mockInteraction.editReply.mock.calls[0][0];
            expect(callArg.embeds.length).toBe(1);
            const embedJson = callArg.embeds[0].toJSON ? callArg.embeds[0].toJSON() : callArg.embeds[0];
            expect(embedJson.title).toContain('Health Check');
        });

        it('should execute /gh issues list and dynamically list issues from Octokit client', async () => {
            const mockInteraction = createMockInteraction({
                user: { id: 'member-1' },
                options: {
                    getSubcommandGroup: () => 'issues',
                    getSubcommand: () => 'list',
                    getString: (name: string) =>
                        name === 'repo' ? 'octo-org/test-repo' : name === 'state' ? 'open' : null,
                    getInteger: (name: string) => (name === 'limit' ? 5 : null),
                },
                memberPermissions: new PermissionsBitField(0n),
            });

            await executeGhDispatcher(mockInteraction, false, mockDeps);

            expect(mockInstallationResolver.resolveForGuild).toHaveBeenCalledWith('guild-1', 'octo-org/test-repo');
            expect(mockClientResolver.forInstallation).toHaveBeenCalledWith(1001);
            expect(mockInteraction.editReply).toHaveBeenCalledTimes(1);
            const callArg = mockInteraction.editReply.mock.calls[0][0];
            expect(callArg.embeds.length).toBe(1);
            const embedJson = callArg.embeds[0].toJSON ? callArg.embeds[0].toJSON() : callArg.embeds[0];
            expect(embedJson.title).toContain('Issues');
            expect(embedJson.fields[0].name).toContain('#10');
        });

        it('should reject /gh issues list if repository is not actively watched in guild', async () => {
            mockSubscriptionModel.findOne = mock(() => makeQuery(null));

            const mockInteraction = createMockInteraction({
                user: { id: 'member-1' },
                options: {
                    getSubcommandGroup: () => 'issues',
                    getSubcommand: () => 'list',
                    getString: (name: string) => (name === 'repo' ? 'octo-org/unwatched-repo' : null),
                    getInteger: () => null,
                },
                memberPermissions: new PermissionsBitField(0n),
            });

            await executeGhDispatcher(mockInteraction, false, mockDeps);

            expect(mockInteraction.reply).toHaveBeenCalledTimes(1);
            const callArg = mockInteraction.reply.mock.calls[0][0];
            expect(callArg.content).toContain('OctoBot is not watching');
            expect(callArg.content).toContain('octo-org/unwatched-repo');
        });

        it('should append deprecation notice to /github deprecated command responses in github_app mode', async () => {
            const mockInteraction = createMockInteraction({
                commandName: 'github',
                user: { id: 'member-1' },
                options: {
                    getSubcommandGroup: () => null,
                    getSubcommand: () => 'status',
                },
                memberPermissions: new PermissionsBitField(0n),
            });

            await executeGhDispatcher(mockInteraction, true, mockDeps);

            expect(mockInteraction.reply).toHaveBeenCalledTimes(1);
            const callArg = mockInteraction.reply.mock.calls[0][0];
            const embedJson = callArg.embeds[0].toJSON ? callArg.embeds[0].toJSON() : callArg.embeds[0];
            expect(embedJson.footer?.text).toContain(DEPRECATION_NOTICE);
        });

        it('should dispatch to legacy handler when /github is executed in legacy_pat mode', async () => {
            const origEnv = { ...process.env };
            try {
                process.env.NODE_ENV = 'development';
                process.env.DISCORD_TOKEN = 'test-token';
                process.env.DISCORD_CLIENT_ID = '123456789012345678';
                process.env.DISCORD_GUILD_ID = '987654321098765432';
                process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
                process.env.GITHUB_TOKEN = 'ghp_legacy_test_token';
                process.env.GITHUB_OWNER = 'octo-org';
                process.env.GITHUB_WEBHOOK_SECRET = 'secret';
                delete process.env.GITHUB_APP_ID;
                delete process.env.GITHUB_APP_PRIVATE_KEY;
                delete process.env.GITHUB_CLIENT_ID;
                delete process.env.GITHUB_CLIENT_SECRET;

                const mockInteraction = createMockInteraction({
                    commandName: 'github',
                    user: { id: 'member-1' },
                    options: {
                        getSubcommandGroup: () => 'repo',
                        getSubcommand: () => 'unsupported_test',
                    },
                    memberPermissions: new PermissionsBitField(0n),
                });

                await github.execute(mockInteraction as any);

                expect(mockInteraction.reply).toHaveBeenCalledTimes(1);
                const callArg = mockInteraction.reply.mock.calls[0][0];
                expect(callArg.content).toContain('only supported in GitHub App mode');
            } finally {
                process.env = origEnv;
            }
        });
    });
});
