import { describe, expect, it, mock, beforeEach } from 'bun:test';
import { routeEventToSubscriptions, SubscriptionRouter } from '../../src/pipeline/router';
import { EventProcessor } from '../../src/pipeline/processor';
import { VerifiedGithubDelivery } from '../../src/pipeline/types';
import { IGitHubClientResolver } from '../../src/services/github/githubClientResolver';

describe('Pipeline - Multi-Tenant Routing & Fail-Closed Verification', () => {
    describe('routeEventToSubscriptions and SubscriptionRouter', () => {
        it('should route delivery strictly to matching (installationId, repositoryId, guildId)', async () => {
            const mockSubscriptions = [
                {
                    _id: 'sub-1',
                    guildId: 'guild-100',
                    channelId: 'channel-100',
                    installationId: 1001,
                    repositoryId: 42,
                    repositoryFullName: 'acme/app',
                    active: true,
                    events: ['push'],
                },
            ];

            const mockSubModel = {
                find: mock(async (query: any) => {
                    expect(query.installationId).toBe(1001);
                    expect(query.repositoryId).toBe(42);
                    expect(query.active).toBe(true);
                    return mockSubscriptions;
                }),
            } as any;

            const mockGuildConnModel = {
                findOne: mock(async (query: any) => {
                    expect(query.guildId).toBe('guild-100');
                    expect(query.installationId).toBe(1001);
                    expect(query.status).toBe('connected');
                    return { guildId: 'guild-100', installationId: 1001, status: 'connected' };
                }),
            } as any;

            const mockInstModel = {
                findOne: mock(async (query: any) => {
                    expect(query.installationId).toBe(1001);
                    expect(query.status).toBe('active');
                    return { installationId: 1001, status: 'active' };
                }),
            } as any;

            const matched = await routeEventToSubscriptions(
                {
                    repositoryId: 42,
                    installationId: 1001,
                    repositoryFullName: 'acme/app',
                    type: 'push',
                },
                {
                    subModel: mockSubModel,
                    guildConnModel: mockGuildConnModel,
                    instModel: mockInstModel,
                }
            );

            expect(matched.length).toBe(1);
            expect(matched[0].channelId).toBe('channel-100');
            expect(matched[0].guildId).toBe('guild-100');

            const resolution = await SubscriptionRouter.resolveTargetChannels(
                {
                    type: 'push',
                    repositoryFullName: 'acme/app',
                    repositoryId: 42,
                    installationId: 1001,
                    ref: 'refs/heads/main',
                    compareUrl: '',
                    pusherName: 'alice',
                    senderAvatar: '',
                    commits: [],
                } as any,
                {
                    subModel: mockSubModel,
                    guildConnModel: mockGuildConnModel,
                    instModel: mockInstModel,
                }
            );

            expect(resolution.matchedSubscriptionsCount).toBe(1);
            expect(resolution.targetChannelIds).toEqual(['channel-100']);
        });

        it('should guarantee zero cross-tenant leakage: Org A event never routes to Org B subscriptions', async () => {
            const orgASubscription = {
                _id: 'sub-org-a',
                guildId: 'guild-org-a',
                channelId: 'channel-org-a',
                installationId: 1001,
                repositoryId: 99,
                repositoryFullName: 'shared/repo',
                active: true,
                events: ['push'],
            };

            const mockSubModel = {
                find: mock(async (query: any) => {
                    // Query for installation 1001 only returns org A subscriptions
                    if (query.installationId === 1001) {
                        return [orgASubscription];
                    }
                    return [];
                }),
            } as any;

            const mockGuildConnModel = {
                findOne: mock(async () => ({ status: 'connected' })),
            } as any;

            const mockInstModel = {
                findOne: mock(async () => ({ status: 'active' })),
            } as any;

            // Event from Installation 2002 (Org B) for the same repository 99
            const matchedForOrgB = await routeEventToSubscriptions(
                {
                    repositoryId: 99,
                    installationId: 2002,
                    repositoryFullName: 'shared/repo',
                    type: 'push',
                },
                {
                    subModel: mockSubModel,
                    guildConnModel: mockGuildConnModel,
                    instModel: mockInstModel,
                }
            );

            expect(matchedForOrgB.length).toBe(0);
        });

        it('should fail closed (0 deliveries) if DiscordGuildConnection is disconnected', async () => {
            const mockSubscriptions = [
                {
                    guildId: 'guild-1',
                    channelId: 'channel-1',
                    installationId: 1001,
                    repositoryId: 42,
                    active: true,
                },
            ];

            const mockSubModel = { find: mock(async () => mockSubscriptions) } as any;
            const mockGuildConnModel = { findOne: mock(async () => null) } as any; // Not found / disconnected
            const mockInstModel = { findOne: mock(async () => ({ status: 'active' })) } as any;

            const matched = await routeEventToSubscriptions(
                { repositoryId: 42, installationId: 1001, repositoryFullName: 'acme/app' },
                {
                    subModel: mockSubModel,
                    guildConnModel: mockGuildConnModel,
                    instModel: mockInstModel,
                }
            );

            expect(matched.length).toBe(0);

            const resolution = await SubscriptionRouter.resolveTargetChannels(
                {
                    type: 'push',
                    repositoryFullName: 'acme/app',
                    repositoryId: 42,
                    installationId: 1001,
                    ref: 'refs/heads/main',
                    compareUrl: '',
                    pusherName: 'alice',
                    senderAvatar: '',
                    commits: [],
                } as any,
                {
                    subModel: mockSubModel,
                    guildConnModel: mockGuildConnModel,
                    instModel: mockInstModel,
                }
            );

            expect(resolution.matchedSubscriptionsCount).toBe(0);
            expect(resolution.targetChannelIds.length).toBe(0);
        });

        it('should fail closed (0 deliveries) if GitHubInstallation is suspended', async () => {
            const mockSubscriptions = [
                {
                    guildId: 'guild-1',
                    channelId: 'channel-1',
                    installationId: 1001,
                    repositoryId: 42,
                    active: true,
                },
            ];

            const mockSubModel = { find: mock(async () => mockSubscriptions) } as any;
            const mockGuildConnModel = { findOne: mock(async () => ({ status: 'connected' })) } as any;
            const mockInstModel = { findOne: mock(async () => null) } as any; // Not active (suspended/revoked)

            const matched = await routeEventToSubscriptions(
                { repositoryId: 42, installationId: 1001, repositoryFullName: 'acme/app' },
                {
                    subModel: mockSubModel,
                    guildConnModel: mockGuildConnModel,
                    instModel: mockInstModel,
                }
            );

            expect(matched.length).toBe(0);
        });

        it('should fail closed (0 deliveries) if GitHubInstallation is revoked', async () => {
            const mockSubscriptions = [
                {
                    guildId: 'guild-1',
                    channelId: 'channel-1',
                    installationId: 1001,
                    repositoryId: 42,
                    active: true,
                },
            ];

            const mockSubModel = { find: mock(async () => mockSubscriptions) } as any;
            const mockGuildConnModel = { findOne: mock(async () => ({ status: 'connected' })) } as any;
            const mockInstModel = { findOne: mock(async () => ({ status: 'revoked' })) } as any;

            const matched = await routeEventToSubscriptions(
                { repositoryId: 42, installationId: 1001, repositoryFullName: 'acme/app' },
                {
                    subModel: mockSubModel,
                    guildConnModel: mockGuildConnModel,
                    instModel: mockInstModel,
                }
            );

            expect(matched.length).toBe(0);
        });

        it('should support backward compatibility for legacy subscriptions without installationId', async () => {
            const mockSubscriptions = [
                {
                    guildId: 'legacy-guild',
                    channelId: 'legacy-channel',
                    repositoryFullName: 'legacy/repo',
                    active: true,
                    events: ['push'],
                },
            ];

            const mockSubModel = {
                find: mock(async (query: any) => {
                    expect(query.repositoryFullName).toBe('legacy/repo');
                    return mockSubscriptions;
                }),
            } as any;

            const matched = await routeEventToSubscriptions(
                { repositoryFullName: 'legacy/repo', type: 'push' },
                {
                    subModel: mockSubModel,
                    guildConnModel: {} as any,
                    instModel: {} as any,
                }
            );

            expect(matched.length).toBe(1);
            expect(matched[0].channelId).toBe('legacy-channel');
        });
    });

    describe('Lifecycle Events Processing in EventProcessor', () => {
        let mockClientResolver: IGitHubClientResolver;

        beforeEach(() => {
            mockClientResolver = {
                forInstallation: mock(async () => ({}) as any),
                invalidate: mock(() => {}),
            };
        });

        it('should handle installation.created by upserting GitHubInstallationModel as active', async () => {
            const mockInstModel = {
                findOneAndUpdate: mock(async (query: any, update: any, options: any) => {
                    expect(query.installationId).toBe(5001);
                    expect(update.$set.status).toBe('active');
                    expect(update.$set.accountLogin).toBe('octocat-org');
                    expect(update.$set.accountId).toBe(999);
                    expect(update.$set.accountType).toBe('Organization');
                    expect(update.$set.repositorySelection).toBe('selected');
                    expect(options.upsert).toBe(true);
                    return {};
                }),
            } as any;

            const delivery: VerifiedGithubDelivery = {
                deliveryId: 'del-inst-created-1',
                eventName: 'installation',
                receivedAt: new Date(),
                payload: {
                    action: 'created',
                    installation: {
                        id: 5001,
                        account: {
                            id: 999,
                            login: 'Octocat-Org',
                            type: 'Organization',
                        },
                        repository_selection: 'selected',
                        permissions: { issues: 'read', contents: 'read' },
                        events: ['push', 'issues'],
                    },
                },
            };

            const result = await EventProcessor.process(delivery, {
                installationModel: mockInstModel,
                clientResolver: mockClientResolver,
            });

            expect(result.outcome).toBe('succeeded');
            expect(mockInstModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
        });

        it('should handle installation.deleted by marking revoked, disconnecting guild connections, and invalidating cache', async () => {
            const mockInstModel = {
                findOneAndUpdate: mock(async (query: any, update: any) => {
                    expect(query.installationId).toBe(5001);
                    expect(update.$set.status).toBe('revoked');
                    return {};
                }),
            } as any;

            const mockGuildConnModel = {
                updateMany: mock(async (query: any, update: any) => {
                    expect(query.installationId).toBe(5001);
                    expect(update.$set.status).toBe('disconnected');
                    return {};
                }),
            } as any;

            const delivery: VerifiedGithubDelivery = {
                deliveryId: 'del-inst-deleted-1',
                eventName: 'installation',
                receivedAt: new Date(),
                payload: {
                    action: 'deleted',
                    installation: {
                        id: 5001,
                    },
                },
            };

            const result = await EventProcessor.process(delivery, {
                installationModel: mockInstModel,
                guildConnModel: mockGuildConnModel,
                clientResolver: mockClientResolver,
            });

            expect(result.outcome).toBe('succeeded');
            expect(mockInstModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
            expect(mockGuildConnModel.updateMany).toHaveBeenCalledTimes(1);
            expect(mockClientResolver.invalidate).toHaveBeenCalledWith(5001);
        });

        it('should handle installation.suspend by updating status to suspended and invalidating cache', async () => {
            const mockInstModel = {
                findOneAndUpdate: mock(async (query: any, update: any) => {
                    expect(query.installationId).toBe(5001);
                    expect(update.$set.status).toBe('suspended');
                    return {};
                }),
            } as any;

            const delivery: VerifiedGithubDelivery = {
                deliveryId: 'del-inst-suspend-1',
                eventName: 'installation',
                receivedAt: new Date(),
                payload: {
                    action: 'suspend',
                    installation: {
                        id: 5001,
                    },
                },
            };

            const result = await EventProcessor.process(delivery, {
                installationModel: mockInstModel,
                clientResolver: mockClientResolver,
            });

            expect(result.outcome).toBe('succeeded');
            expect(mockInstModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
            expect(mockClientResolver.invalidate).toHaveBeenCalledWith(5001);
        });

        it('should handle installation.unsuspend by updating status to active', async () => {
            const mockInstModel = {
                findOneAndUpdate: mock(async (query: any, update: any) => {
                    expect(query.installationId).toBe(5001);
                    expect(update.$set.status).toBe('active');
                    return {};
                }),
            } as any;

            const delivery: VerifiedGithubDelivery = {
                deliveryId: 'del-inst-unsuspend-1',
                eventName: 'installation',
                receivedAt: new Date(),
                payload: {
                    action: 'unsuspend',
                    installation: {
                        id: 5001,
                    },
                },
            };

            const result = await EventProcessor.process(delivery, {
                installationModel: mockInstModel,
                clientResolver: mockClientResolver,
            });

            expect(result.outcome).toBe('succeeded');
            expect(mockInstModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
        });

        it('should handle installation_repositories.added by updating repositorySelection metadata', async () => {
            const mockInstModel = {
                findOneAndUpdate: mock(async (query: any, update: any) => {
                    expect(query.installationId).toBe(5001);
                    expect(update.$set.repositorySelection).toBe('selected');
                    return {};
                }),
            } as any;

            const delivery: VerifiedGithubDelivery = {
                deliveryId: 'del-inst-repos-added-1',
                eventName: 'installation_repositories',
                receivedAt: new Date(),
                payload: {
                    action: 'added',
                    installation: { id: 5001 },
                    repository_selection: 'selected',
                    repositories_added: [{ id: 101, full_name: 'acme/repo1' }],
                },
            };

            const result = await EventProcessor.process(delivery, {
                installationModel: mockInstModel,
            });

            expect(result.outcome).toBe('succeeded');
            expect(mockInstModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
        });

        it('should handle installation_repositories.removed by deactivating matching subscriptions and updating metadata', async () => {
            const mockSubModel = {
                updateMany: mock(async (query: any, update: any) => {
                    expect(query.installationId).toBe(5001);
                    expect(query.repositoryId.$in).toEqual([101, 102]);
                    expect(update.$set.active).toBe(false);
                    return {};
                }),
            } as any;

            const mockInstModel = {
                findOneAndUpdate: mock(async (query: any, update: any) => {
                    expect(query.installationId).toBe(5001);
                    expect(update.$set.repositorySelection).toBe('selected');
                    return {};
                }),
            } as any;

            const delivery: VerifiedGithubDelivery = {
                deliveryId: 'del-inst-repos-removed-1',
                eventName: 'installation_repositories',
                receivedAt: new Date(),
                payload: {
                    action: 'removed',
                    installation: { id: 5001 },
                    repository_selection: 'selected',
                    repositories_removed: [
                        { id: 101, full_name: 'acme/repo1' },
                        { id: 102, full_name: 'acme/repo2' },
                    ],
                },
            };

            const result = await EventProcessor.process(delivery, {
                subModel: mockSubModel,
                installationModel: mockInstModel,
                clientResolver: null as any,
            });

            expect(result.outcome).toBe('succeeded');
            expect(mockSubModel.updateMany).toHaveBeenCalledTimes(1);
            expect(mockInstModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
        });

        it('should return failed outcome if reconciliation encounters an API failure', async () => {
            const mockSubModel = {
                updateMany: mock(async () => ({})),
                find: mock(async () => []),
            } as any;

            const mockInstModel = {
                findOneAndUpdate: mock(async () => ({})),
            } as any;

            const failingResolver: IGitHubClientResolver = {
                forInstallation: mock(async () => {
                    throw new Error('GitHub API Rate Limit / Network Outage');
                }),
                invalidate: mock(() => {}),
            };

            const delivery: VerifiedGithubDelivery = {
                deliveryId: 'del-inst-repos-reconcile-fail-1',
                eventName: 'installation_repositories',
                receivedAt: new Date(),
                payload: {
                    action: 'removed',
                    installation: { id: 5001 },
                    repository_selection: 'selected',
                    repositories_removed: [],
                },
            };

            const result = await EventProcessor.process(delivery, {
                subModel: mockSubModel,
                installationModel: mockInstModel,
                clientResolver: failingResolver,
            });

            expect(result.outcome).toBe('failed');
            expect(result.error).toContain('Reconciliation failed');
        });

        it('should reconcile selected repositories if clientResolver is available and prune inaccessible subscriptions', async () => {
            const mockSubModel = {
                updateMany: mock(async () => ({})),
                find: mock(async (query: any) => {
                    expect(query.installationId).toBe(5001);
                    expect(query.active).toBe(true);
                    return [
                        { _id: 'sub-active-1', repositoryId: 101, active: true },
                        { _id: 'sub-orphaned-2', repositoryId: 999, active: true },
                    ];
                }),
            } as any;

            const mockInstModel = {
                findOneAndUpdate: mock(async () => ({})),
            } as any;

            const mockOctokit = {
                rest: {
                    apps: {
                        listReposAccessibleToInstallation: mock(async () => ({
                            data: {
                                repositories: [{ id: 101, full_name: 'acme/repo1' }],
                            },
                        })),
                    },
                },
            };

            const mockResolver: IGitHubClientResolver = {
                forInstallation: mock(async () => mockOctokit as any),
                invalidate: mock(() => {}),
            };

            const delivery: VerifiedGithubDelivery = {
                deliveryId: 'del-inst-repos-reconcile-1',
                eventName: 'installation_repositories',
                receivedAt: new Date(),
                payload: {
                    action: 'removed',
                    installation: { id: 5001 },
                    repository_selection: 'selected',
                    repositories_removed: [],
                },
            };

            const result = await EventProcessor.process(delivery, {
                subModel: mockSubModel,
                installationModel: mockInstModel,
                clientResolver: mockResolver,
            });

            expect(result.outcome).toBe('succeeded');
            expect(mockResolver.forInstallation).toHaveBeenCalledWith(5001);
            expect(mockSubModel.updateMany).toHaveBeenCalled();
        });

        it('should paginate through all accessible repository pages during reconciliation', async () => {
            const mockSubModel = {
                updateMany: mock(async () => ({})),
                find: mock(async () => [
                    { _id: 'sub-p1', repositoryId: 100, active: true },
                    { _id: 'sub-p2', repositoryId: 200, active: true },
                    { _id: 'sub-orphaned', repositoryId: 999, active: true },
                ]),
            } as any;

            const mockInstModel = {
                findOneAndUpdate: mock(async () => ({})),
            } as any;

            const page1Repos = Array.from({ length: 100 }, (_, i) => ({
                id: i + 1,
                full_name: `acme/repo-${i + 1}`,
            }));
            const page2Repos = [{ id: 200, full_name: 'acme/repo-200' }];

            const listReposMock = mock(async ({ page }: { page?: number }) => {
                if (page === 2) {
                    return {
                        data: {
                            total_count: 101,
                            repositories: page2Repos,
                        },
                    };
                }
                return {
                    data: {
                        total_count: 101,
                        repositories: page1Repos,
                    },
                };
            });

            const mockResolver: IGitHubClientResolver = {
                forInstallation: mock(
                    async () =>
                        ({
                            rest: {
                                apps: {
                                    listReposAccessibleToInstallation: listReposMock,
                                },
                            },
                        }) as any
                ),
                invalidate: mock(() => {}),
            };

            const delivery: VerifiedGithubDelivery = {
                deliveryId: 'del-inst-repos-multi-page-1',
                eventName: 'installation_repositories',
                receivedAt: new Date(),
                payload: {
                    action: 'removed',
                    installation: { id: 5001 },
                    repository_selection: 'selected',
                    repositories_removed: [],
                },
            };

            const result = await EventProcessor.process(delivery, {
                subModel: mockSubModel,
                installationModel: mockInstModel,
                clientResolver: mockResolver,
            });

            expect(result.outcome).toBe('succeeded');
            expect(listReposMock).toHaveBeenCalledTimes(2);
            expect(mockSubModel.updateMany).toHaveBeenCalledWith(
                { _id: { $in: ['sub-orphaned'] } },
                { $set: { active: false } }
            );
        });

        it('should return invalid_payload if lifecycle event is missing installation id', async () => {
            const delivery: VerifiedGithubDelivery = {
                deliveryId: 'del-inst-malformed-1',
                eventName: 'installation',
                receivedAt: new Date(),
                payload: {
                    action: 'created',
                    installation: {},
                },
            };

            const result = await EventProcessor.process(delivery);
            expect(result.outcome).toBe('invalid_payload');
            expect(result.error).toBeDefined();
        });
    });
});
