import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import crypto from 'crypto';
import type { Server } from 'http';
import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';

import { createApp } from '@/app';
import { executeGhDispatcher } from '@commands/gh/dispatcher';
import { DiscordGuildConnectionModel } from '@models/discordGuildConnection';
import { GitHubConnectionAttemptModel } from '@models/githubConnectionAttempt';
import { GitHubInstallationModel } from '@models/githubInstallation';
import { SubscriptionModel } from '@models/subscription';
import { WebhookDeliveryModel } from '@models/webhookDelivery';
import { WorkflowAlertStateModel } from '@models/workflowAlertState';
import { discordService } from '@services/discordService';
import { getGitHubClientResolver } from '@services/github/githubClientResolver';
import { routeEventToSubscriptions, SubscriptionRouter } from '@/pipeline/router';
import { EventProcessor } from '@/pipeline/processor';
import type { DiscordNotification } from '@/types/discord';
import { DEPRECATION_NOTICE } from '@services/discord/commandResponseDecorator';

const TEST_SECRET = 'test-security-webhook-secret-key-12345';
const TEST_APP_ID = 123456;
const TEST_PRIVATE_KEY = '-----BEGIN RSA PRIVATE KEY-----\nMIIEfakeKeyForTesting\n-----END RSA PRIVATE KEY-----';
const TEST_CLIENT_ID = 'Iv1.test_client_id';
const TEST_CLIENT_SECRET = 'test_client_secret';

describe('Security - Multi-Tenant Isolation & Attack Surface Suite', () => {
    let server: Server;
    let baseUrl: string;
    let originalEnv: Record<string, string | undefined>;

    // In-memory data store for security testing
    let memoryAttempts: Map<string, any> = new Map();
    let memoryInstallations: Map<number, any> = new Map();
    let memoryGuildConnections: Map<string, any> = new Map(); // key: `${guildId}:${installationId}`
    let memorySubscriptions: any[] = [];
    let memoryDeliveries: Map<string, any> = new Map();

    let deliveredNotifications: Array<{ channelId: string; notification: DiscordNotification }> = [];

    const nativeFetch = globalThis.fetch;

    beforeEach(async () => {
        originalEnv = {
            GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET,
            GITHUB_APP_ID: process.env.GITHUB_APP_ID,
            GITHUB_APP_PRIVATE_KEY: process.env.GITHUB_APP_PRIVATE_KEY,
            GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
            GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
        };

        process.env.GITHUB_WEBHOOK_SECRET = TEST_SECRET;
        process.env.GITHUB_APP_ID = String(TEST_APP_ID);
        process.env.GITHUB_APP_PRIVATE_KEY = TEST_PRIVATE_KEY;
        process.env.GITHUB_CLIENT_ID = TEST_CLIENT_ID;
        process.env.GITHUB_CLIENT_SECRET = TEST_CLIENT_SECRET;

        memoryAttempts = new Map();
        memoryInstallations = new Map();
        memoryGuildConnections = new Map();
        memorySubscriptions = [];
        memoryDeliveries = new Map();
        deliveredNotifications = [];

        // 1. Mock GitHubConnectionAttemptModel
        spyOn(GitHubConnectionAttemptModel, 'create').mockImplementation((doc: any) => {
            const attemptDoc = {
                ...doc,
                _id: doc._id || `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                createdAt: new Date(),
                updatedAt: new Date(),
                save: mock(async function (this: any) {
                    memoryAttempts.set(this.installStateHash, this);
                    if (this.oauthStateHash) {
                        memoryAttempts.set(this.oauthStateHash, this);
                    }
                    return this;
                }),
            };
            memoryAttempts.set(attemptDoc.installStateHash, attemptDoc);
            return Promise.resolve(attemptDoc) as any;
        });

        spyOn(GitHubConnectionAttemptModel, 'findOne').mockImplementation((query: any) => {
            for (const attempt of memoryAttempts.values()) {
                let matches = true;
                if (query.installStateHash && attempt.installStateHash !== query.installStateHash) matches = false;
                if (query.oauthStateHash && attempt.oauthStateHash !== query.oauthStateHash) matches = false;
                if (query.status && attempt.status !== query.status) matches = false;
                if (query.expiresAt?.$gt && !(attempt.expiresAt > query.expiresAt.$gt)) matches = false;

                if (matches) {
                    const doc = {
                        ...attempt,
                        save: mock(async function (this: any) {
                            memoryAttempts.set(this.installStateHash, this);
                            if (this.oauthStateHash) {
                                memoryAttempts.set(this.oauthStateHash, this);
                            }
                            return this;
                        }),
                    };
                    const resPromise: any = Promise.resolve(doc);
                    resPromise.lean = () => Promise.resolve(doc);
                    return resPromise;
                }
            }
            const nullPromise: any = Promise.resolve(null);
            nullPromise.lean = () => Promise.resolve(null);
            return nullPromise;
        });

        spyOn(GitHubConnectionAttemptModel, 'findOneAndUpdate').mockImplementation((query: any, update: any) => {
            for (const attempt of memoryAttempts.values()) {
                let matches = true;
                if (query.installStateHash && attempt.installStateHash !== query.installStateHash) matches = false;
                if (query.oauthStateHash && attempt.oauthStateHash !== query.oauthStateHash) matches = false;
                if (query.status && attempt.status !== query.status) matches = false;
                if (query.expiresAt?.$gt && !(attempt.expiresAt > query.expiresAt.$gt)) matches = false;

                if (matches) {
                    const updated = {
                        ...attempt,
                        ...(update.$set || {}),
                        ...(update.status ? { status: update.status } : {}),
                        updatedAt: new Date(),
                    };
                    updated.save = mock(async function (this: any) {
                        memoryAttempts.set(this.installStateHash, this);
                        if (this.oauthStateHash) {
                            memoryAttempts.set(this.oauthStateHash, this);
                        }
                        return this;
                    });
                    memoryAttempts.set(updated.installStateHash, updated);
                    if (updated.oauthStateHash) {
                        memoryAttempts.set(updated.oauthStateHash, updated);
                    }
                    const resPromise: any = Promise.resolve(updated);
                    resPromise.lean = () => Promise.resolve(updated);
                    return resPromise;
                }
            }
            const nullPromise: any = Promise.resolve(null);
            nullPromise.lean = () => Promise.resolve(null);
            return nullPromise;
        });

        spyOn(GitHubConnectionAttemptModel, 'updateOne').mockImplementation((query: any, update: any) => {
            for (const [key, attempt] of memoryAttempts.entries()) {
                if (query._id && attempt._id === query._id) {
                    const updated = { ...attempt, ...(update.$set || update), updatedAt: new Date() };
                    memoryAttempts.set(key, updated);
                }
            }
            return Promise.resolve({ modifiedCount: 1 }) as any;
        });

        // 2. Mock GitHubInstallationModel
        spyOn(GitHubInstallationModel, 'findOne').mockImplementation((query: any) => {
            const inst = memoryInstallations.get(Number(query.installationId));
            if (!inst) {
                const nullPromise: any = Promise.resolve(null);
                nullPromise.lean = () => Promise.resolve(null);
                return nullPromise;
            }
            if (query.status && inst.status !== query.status) {
                const nullPromise: any = Promise.resolve(null);
                nullPromise.lean = () => Promise.resolve(null);
                return nullPromise;
            }
            const resPromise: any = Promise.resolve(inst);
            resPromise.lean = () => Promise.resolve(inst);
            return resPromise;
        });

        spyOn(GitHubInstallationModel, 'find').mockImplementation((query: any) => {
            const insts = Array.from(memoryInstallations.values()).filter((inst) => {
                if (query.installationId?.$in && !query.installationId.$in.includes(inst.installationId)) return false;
                if (query.status && inst.status !== query.status) return false;
                return true;
            });
            const resPromise: any = Promise.resolve(insts);
            resPromise.lean = () => Promise.resolve(insts);
            return resPromise;
        });

        spyOn(GitHubInstallationModel, 'findOneAndUpdate').mockImplementation((query: any, update: any) => {
            const instId = Number(query.installationId);
            const existing = memoryInstallations.get(instId) || { installationId: instId };
            const updated = {
                ...existing,
                ...(update.$set || {}),
                ...(update.installationId !== undefined ? update : {}),
                updatedAt: new Date(),
            };
            memoryInstallations.set(instId, updated);
            const resPromise: any = Promise.resolve(updated);
            resPromise.lean = () => Promise.resolve(updated);
            return resPromise;
        });

        // 3. Mock DiscordGuildConnectionModel
        spyOn(DiscordGuildConnectionModel, 'find').mockImplementation((query: any) => {
            const conns = Array.from(memoryGuildConnections.values()).filter((c) => {
                if (query.guildId && c.guildId !== query.guildId) return false;
                if (query.installationId && c.installationId !== query.installationId) return false;
                if (query.status && c.status !== query.status) return false;
                return true;
            });
            const resPromise: any = Promise.resolve(conns);
            resPromise.lean = () => Promise.resolve(conns);
            return resPromise;
        });

        spyOn(DiscordGuildConnectionModel, 'findOne').mockImplementation((query: any) => {
            const conns = Array.from(memoryGuildConnections.values()).filter((c) => {
                if (query.guildId && c.guildId !== query.guildId) return false;
                if (query.installationId && c.installationId !== query.installationId) return false;
                if (query.status && c.status !== query.status) return false;
                return true;
            });
            const resPromise: any = Promise.resolve(conns[0] || null);
            resPromise.lean = () => Promise.resolve(conns[0] || null);
            return resPromise;
        });

        spyOn(DiscordGuildConnectionModel, 'findOneAndUpdate').mockImplementation((query: any, update: any) => {
            const key = `${query.guildId}:${query.installationId}`;
            const existing = memoryGuildConnections.get(key) || {
                guildId: query.guildId,
                installationId: query.installationId,
            };
            const updated = {
                ...existing,
                ...(update.$set || {}),
                ...(update.guildId !== undefined ? update : {}),
                updatedAt: new Date(),
            };
            memoryGuildConnections.set(key, updated);
            const resPromise: any = Promise.resolve(updated);
            resPromise.lean = () => Promise.resolve(updated);
            return resPromise;
        });

        spyOn(DiscordGuildConnectionModel, 'updateMany').mockImplementation((query: any, update: any) => {
            for (const [k, c] of memoryGuildConnections.entries()) {
                if (query.installationId && c.installationId === query.installationId) {
                    const updated = { ...c, ...(update.$set || update), updatedAt: new Date() };
                    memoryGuildConnections.set(k, updated);
                }
            }
            return Promise.resolve({ modifiedCount: 1 }) as any;
        });

        // 4. Mock SubscriptionModel
        spyOn(SubscriptionModel, 'find').mockImplementation((query: any) => {
            const matches = memorySubscriptions.filter((s) => {
                if (query.installationId && s.installationId !== query.installationId) return false;
                if (query.repositoryId && s.repositoryId !== query.repositoryId) return false;
                if (query.guildId && s.guildId !== query.guildId) return false;
                if (query.repositoryFullName && s.repositoryFullName !== query.repositoryFullName) return false;
                if (query.active !== undefined && s.active !== query.active) return false;
                return true;
            });
            const resPromise: any = Promise.resolve(matches);
            resPromise.lean = () => Promise.resolve(matches);
            return resPromise;
        });

        spyOn(SubscriptionModel, 'findOne').mockImplementation((query: any) => {
            const matches = memorySubscriptions.filter((s) => {
                if (query.installationId && s.installationId !== query.installationId) return false;
                if (query.repositoryId && s.repositoryId !== query.repositoryId) return false;
                if (query.guildId && s.guildId !== query.guildId) return false;
                if (query.channelId && s.channelId !== query.channelId) return false;
                if (query.repositoryFullName && s.repositoryFullName !== query.repositoryFullName) return false;
                if (query.active !== undefined && s.active !== query.active) return false;
                return true;
            });
            const resPromise: any = Promise.resolve(matches[0] || null);
            resPromise.lean = () => Promise.resolve(matches[0] || null);
            return resPromise;
        });

        spyOn(SubscriptionModel, 'findOneAndUpdate').mockImplementation((query: any, update: any) => {
            const idx = memorySubscriptions.findIndex(
                (s) =>
                    s.guildId === query.guildId &&
                    s.channelId === query.channelId &&
                    (query.installationId ? s.installationId === query.installationId : true) &&
                    (query.repositoryId ? s.repositoryId === query.repositoryId : true)
            );

            const updatedData = {
                ...(idx >= 0 ? memorySubscriptions[idx] : {}),
                ...(update.$set || {}),
                ...(update.guildId !== undefined ? update : {}),
                _id: idx >= 0 ? memorySubscriptions[idx]._id : `sub-${Date.now()}-${Math.random()}`,
                updatedAt: new Date(),
            };

            if (idx >= 0) {
                memorySubscriptions[idx] = updatedData;
            } else {
                memorySubscriptions.push(updatedData);
            }

            const resPromise: any = Promise.resolve(updatedData);
            resPromise.lean = () => Promise.resolve(updatedData);
            return resPromise;
        });

        spyOn(SubscriptionModel, 'updateMany').mockImplementation((query: any, update: any) => {
            let count = 0;
            memorySubscriptions.forEach((s) => {
                let matches = true;
                if (query.installationId && s.installationId !== query.installationId) matches = false;
                if (query.repositoryId?.$in && !query.repositoryId.$in.includes(s.repositoryId)) matches = false;
                if (query._id?.$in && !query._id.$in.includes(s._id)) matches = false;

                if (matches) {
                    Object.assign(s, update.$set || update);
                    count++;
                }
            });
            return Promise.resolve({ modifiedCount: count }) as any;
        });

        // 5. Mock WebhookDeliveryModel & WorkflowAlertStateModel
        spyOn(WebhookDeliveryModel, 'create').mockImplementation((doc: any) => {
            if (memoryDeliveries.has(doc.deliveryId)) {
                const err: any = new Error('Duplicate key');
                err.code = 11000;
                err.name = 'MongoServerError';
                return Promise.reject(err);
            }
            const record = { ...doc };
            memoryDeliveries.set(doc.deliveryId, record);
            return Promise.resolve(record) as any;
        });

        spyOn(WebhookDeliveryModel, 'findOne').mockImplementation((query: any) => {
            return Promise.resolve(memoryDeliveries.get(query.deliveryId) || null) as any;
        });

        spyOn(WebhookDeliveryModel, 'findOneAndUpdate').mockImplementation((query: any, update: any) => {
            const existing = memoryDeliveries.get(query.deliveryId);
            if (!existing) return Promise.resolve(null) as any;
            const updated = { ...existing, ...(update.$set || update) };
            memoryDeliveries.set(query.deliveryId, updated);
            return Promise.resolve(updated) as any;
        });

        spyOn(WorkflowAlertStateModel, 'findOne').mockImplementation(() => Promise.resolve(null) as any);
        spyOn(WorkflowAlertStateModel, 'findOneAndUpdate').mockImplementation(
            (_q: any, u: any) => Promise.resolve(u.$set || u) as any
        );

        // 6. Mock Discord delivery
        spyOn(discordService, 'sendNotification').mockImplementation((channelId: string, notification: any) => {
            deliveredNotifications.push({ channelId, notification });
            return Promise.resolve();
        });

        // 7. Mock Client Resolver
        const clientResolver = getGitHubClientResolver();
        spyOn(clientResolver, 'forInstallation').mockImplementation(async (installationId: number) => {
            if (installationId === 1001) {
                return {
                    rest: {
                        repos: {
                            get: mock(async ({ owner, repo }: any) => {
                                if (owner === 'org-a' && repo === 'repo-1') {
                                    return {
                                        data: {
                                            id: 5001,
                                            name: 'repo-1',
                                            full_name: 'org-a/repo-1',
                                            html_url: 'https://github.com/org-a/repo-1',
                                        },
                                    };
                                }
                                throw { status: 404, message: 'Not Found' };
                            }),
                        },
                        issues: {
                            listForRepo: mock(async () => ({ data: [] })),
                        },
                    },
                } as any;
            }
            throw new Error(`Unexpected installationId: ${installationId}`);
        });

        EventProcessor.setClientResolver(clientResolver);

        // 8. Start Express App
        const app = createApp({
            client: { isReady: () => true },
            webhookConnected: true,
            databaseConnected: true,
        });

        await new Promise<void>((resolve) => {
            server = app.listen(0, () => {
                const addr: any = server.address();
                baseUrl = `http://127.0.0.1:${addr.port}`;
                resolve();
            });
        });
    });

    afterEach(async () => {
        globalThis.fetch = nativeFetch;

        for (const [k, v] of Object.entries(originalEnv)) {
            if (v !== undefined) {
                process.env[k] = v;
            } else {
                delete process.env[k];
            }
        }

        if (server) {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });

    function createMockInteraction({
        commandName = 'gh',
        group = null,
        subcommand = 'status',
        guildId = 'guild-sec',
        channelId = 'channel-sec',
        userId = 'user-sec',
        permissions = 0n,
        stringOptions = {},
    }: {
        commandName?: string;
        group?: string | null;
        subcommand?: string | null;
        guildId?: string;
        channelId?: string;
        userId?: string;
        permissions?: bigint;
        stringOptions?: Record<string, string>;
    }) {
        const replies: any[] = [];
        const interaction: any = {
            commandName,
            guildId,
            channelId,
            user: { id: userId },
            memberPermissions: new PermissionsBitField(permissions),
            replied: false,
            deferred: false,
            reply: mock(async (payload: any) => {
                interaction.replied = true;
                replies.push(payload);
                return payload;
            }),
            deferReply: mock(async () => {
                interaction.deferred = true;
            }),
            editReply: mock(async (payload: any) => {
                interaction.replied = true;
                replies.push(payload);
                return payload;
            }),
            options: {
                getSubcommandGroup: () => group,
                getSubcommand: () => subcommand,
                getString: (name: string) => stringOptions[name] ?? null,
                getInteger: () => null,
            },
            getReplies: () => replies,
        };
        return interaction;
    }

    // =========================================================================
    // 1. ANTI-SPOOFING PROOF-OF-ASSOCIATION TESTS
    // =========================================================================
    describe('Anti-Spoofing Proof-of-Association', () => {
        it('rejects connection when candidate installation ID is not accessible to authenticated GitHub user (HTTP 403)', async () => {
            // Admin initiates connection for installation 9999 (attacker does not own)
            const connectInteraction = createMockInteraction({
                commandName: 'gh',
                subcommand: 'connect',
                guildId: 'guild-victim',
                userId: 'admin-victim',
                permissions: PermissionFlagsBits.ManageGuild,
            });
            await executeGhDispatcher(connectInteraction, false);
            const reply = connectInteraction.getReplies()[0];
            const installNonce = reply.embeds[0].data.description.match(/state=([a-f0-9]+)/)![1];

            // Attacker triggers setup targeting installation 9999
            const setupRes = await nativeFetch(
                `${baseUrl}/api/github/setup?installation_id=9999&state=${installNonce}`,
                { redirect: 'manual' }
            );
            expect(setupRes.status).toBe(302);
            const oauthLocation = setupRes.headers.get('location')!;
            const oauthNonce = new URL(oauthLocation).searchParams.get('state')!;

            // Mock OAuth user response returning ONLY installation 1001 (not 9999)
            globalThis.fetch = mock(async (url: any) => {
                const urlStr = String(url);
                if (urlStr.includes('/login/oauth/access_token')) {
                    return new Response(JSON.stringify({ access_token: 'gho_attacker_token', token_type: 'bearer' }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    });
                }
                if (urlStr.includes('/user/installations')) {
                    return new Response(
                        JSON.stringify({
                            total_count: 1,
                            installations: [
                                {
                                    id: 1001, // Legitimate installation, does NOT match 9999
                                    account: { id: 101, login: 'legit-org', type: 'Organization' },
                                },
                            ],
                        }),
                        { status: 200, headers: { 'Content-Type': 'application/json' } }
                    );
                }
                return nativeFetch(url);
            });

            // Callback request should fail with 403 Forbidden
            const callbackRes = await nativeFetch(
                `${baseUrl}/api/github/callback?code=attacker-code&state=${oauthNonce}`
            );
            expect(callbackRes.status).toBe(403);
            const body = await callbackRes.text();
            expect(body).toContain('Installation verification failed');

            // Verify ZERO DiscordGuildConnection and ZERO GitHubInstallation created for 9999
            expect(memoryGuildConnections.get('guild-victim:9999')).toBeUndefined();
            expect(memoryInstallations.get(9999)).toBeUndefined();
        });

        it('rejects connection when GitHub user installations API returns an error', async () => {
            const connectInteraction = createMockInteraction({
                commandName: 'gh',
                subcommand: 'connect',
                guildId: 'guild-victim-2',
                userId: 'admin-victim-2',
                permissions: PermissionFlagsBits.ManageGuild,
            });
            await executeGhDispatcher(connectInteraction, false);
            const reply = connectInteraction.getReplies()[0];
            const installNonce = reply.embeds[0].data.description.match(/state=([a-f0-9]+)/)![1];

            const setupRes = await nativeFetch(
                `${baseUrl}/api/github/setup?installation_id=1001&state=${installNonce}`,
                { redirect: 'manual' }
            );
            const oauthLocation = setupRes.headers.get('location')!;
            const oauthNonce = new URL(oauthLocation).searchParams.get('state')!;

            // Mock GitHub API failure
            globalThis.fetch = mock(async (url: any) => {
                const urlStr = String(url);
                if (urlStr.includes('/login/oauth/access_token')) {
                    return new Response(JSON.stringify({ access_token: 'gho_some_token', token_type: 'bearer' }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    });
                }
                if (urlStr.includes('/user/installations')) {
                    return new Response('GitHub API Internal Error', { status: 500 });
                }
                return nativeFetch(url);
            });

            const callbackRes = await nativeFetch(`${baseUrl}/api/github/callback?code=some-code&state=${oauthNonce}`);
            expect(callbackRes.status).toBe(403);
            expect(memoryGuildConnections.get('guild-victim-2:1001')).toBeUndefined();
        });
    });

    // =========================================================================
    // 2. REPLAY & CONCURRENCY ATTACKS
    // =========================================================================
    describe('Replay & Concurrency Attacks', () => {
        it('rejects replayed setup nonces (HTTP 400)', async () => {
            const connectInteraction = createMockInteraction({
                commandName: 'gh',
                subcommand: 'connect',
                guildId: 'guild-replay',
                userId: 'admin-replay',
                permissions: PermissionFlagsBits.ManageGuild,
            });
            await executeGhDispatcher(connectInteraction, false);
            const reply = connectInteraction.getReplies()[0];
            const installNonce = reply.embeds[0].data.description.match(/state=([a-f0-9]+)/)![1];

            // First setup request succeeds
            const setupRes1 = await nativeFetch(
                `${baseUrl}/api/github/setup?installation_id=1001&state=${installNonce}`,
                { redirect: 'manual' }
            );
            expect(setupRes1.status).toBe(302);

            // Replayed setup request with the same nonce must be rejected (400)
            const setupRes2 = await nativeFetch(
                `${baseUrl}/api/github/setup?installation_id=1001&state=${installNonce}`,
                { redirect: 'manual' }
            );
            expect(setupRes2.status).toBe(400);
            const body = await setupRes2.text();
            expect(body).toContain('Connection request expired or already consumed');
        });

        it('rejects replayed callback oauth states (HTTP 400)', async () => {
            const connectInteraction = createMockInteraction({
                commandName: 'gh',
                subcommand: 'connect',
                guildId: 'guild-oauth-replay',
                userId: 'admin-oauth-replay',
                permissions: PermissionFlagsBits.ManageGuild,
            });
            await executeGhDispatcher(connectInteraction, false);
            const reply = connectInteraction.getReplies()[0];
            const installNonce = reply.embeds[0].data.description.match(/state=([a-f0-9]+)/)![1];

            const setupRes = await nativeFetch(
                `${baseUrl}/api/github/setup?installation_id=1001&state=${installNonce}`,
                { redirect: 'manual' }
            );
            const oauthNonce = new URL(setupRes.headers.get('location')!).searchParams.get('state')!;

            globalThis.fetch = mock(async (url: any) => {
                const urlStr = String(url);
                if (urlStr.includes('/login/oauth/access_token')) {
                    return new Response(JSON.stringify({ access_token: 'gho_token', token_type: 'bearer' }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    });
                }
                if (urlStr.includes('/user/installations')) {
                    return new Response(
                        JSON.stringify({
                            total_count: 1,
                            installations: [{ id: 1001, account: { id: 101, login: 'org-a' } }],
                        }),
                        { status: 200, headers: { 'Content-Type': 'application/json' } }
                    );
                }
                return nativeFetch(url);
            });

            // First callback succeeds
            const callbackRes1 = await nativeFetch(`${baseUrl}/api/github/callback?code=code-1&state=${oauthNonce}`);
            expect(callbackRes1.status).toBe(200);

            // Second callback with same oauth state must be rejected (400)
            const callbackRes2 = await nativeFetch(`${baseUrl}/api/github/callback?code=code-1&state=${oauthNonce}`);
            expect(callbackRes2.status).toBe(400);
            const body = await callbackRes2.text();
            expect(body).toContain('Invalid or expired authorization session');
        });

        it('rejects expired connection attempts (> 10m TTL) with HTTP 400', async () => {
            const rawNonce = crypto.randomBytes(32).toString('hex');
            const installStateHash = crypto.createHash('sha256').update(rawNonce).digest('hex');

            // Save already expired attempt
            const expiredAttempt = {
                installStateHash,
                guildId: 'guild-expired',
                initiatedByDiscordUserId: 'user-expired',
                status: 'pending_setup',
                expiresAt: new Date(Date.now() - 60 * 1000), // 1 minute in the past
                save: mock(async function (this: any) {
                    return this;
                }),
            };
            memoryAttempts.set(installStateHash, expiredAttempt);

            const setupRes = await nativeFetch(`${baseUrl}/api/github/setup?installation_id=1001&state=${rawNonce}`, {
                redirect: 'manual',
            });
            expect(setupRes.status).toBe(400);
            const body = await setupRes.text();
            expect(body).toContain('Connection request expired or already consumed');
        });

        it('rejects callback with tampered PKCE code_verifier or invalid token exchange', async () => {
            const connectInteraction = createMockInteraction({
                commandName: 'gh',
                subcommand: 'connect',
                guildId: 'guild-tamper',
                userId: 'admin-tamper',
                permissions: PermissionFlagsBits.ManageGuild,
            });
            await executeGhDispatcher(connectInteraction, false);
            const reply = connectInteraction.getReplies()[0];
            const installNonce = reply.embeds[0].data.description.match(/state=([a-f0-9]+)/)![1];

            const setupRes = await nativeFetch(
                `${baseUrl}/api/github/setup?installation_id=1001&state=${installNonce}`,
                { redirect: 'manual' }
            );
            const oauthNonce = new URL(setupRes.headers.get('location')!).searchParams.get('state')!;

            // Mock GitHub OAuth rejection due to bad_verification_code
            globalThis.fetch = mock(async (url: any) => {
                const urlStr = String(url);
                if (urlStr.includes('/login/oauth/access_token')) {
                    return new Response(
                        JSON.stringify({
                            error: 'bad_verification_code',
                            error_description: 'The code_verifier did not match code_challenge',
                        }),
                        { status: 400, headers: { 'Content-Type': 'application/json' } }
                    );
                }
                return nativeFetch(url);
            });

            const callbackRes = await nativeFetch(`${baseUrl}/api/github/callback?code=bad-code&state=${oauthNonce}`);
            expect(callbackRes.status).toBe(400);
            const body = await callbackRes.text();
            expect(body).toContain('code_verifier did not match');

            // Ensure no connection was created
            expect(memoryGuildConnections.get('guild-tamper:1001')).toBeUndefined();
        });
    });

    // =========================================================================
    // 3. FAIL-CLOSED CROSS-TENANT INVARIANTS
    // =========================================================================
    describe('Fail-Closed Cross-Tenant Invariants', () => {
        it('routes zero deliveries when guild connection is disconnected', async () => {
            memoryInstallations.set(1001, {
                installationId: 1001,
                status: 'active',
                accountLogin: 'org-a',
            });
            memoryGuildConnections.set('guild-a:1001', {
                guildId: 'guild-a',
                installationId: 1001,
                status: 'disconnected', // DISCONNECTED
            });
            memorySubscriptions.push({
                repositoryFullName: 'org-a/repo-1',
                installationId: 1001,
                repositoryId: 5001,
                guildId: 'guild-a',
                channelId: 'chan-a',
                active: true,
                events: ['push'],
            });

            const subs = await routeEventToSubscriptions({
                installationId: 1001,
                repositoryId: 5001,
                repositoryFullName: 'org-a/repo-1',
                type: 'push',
            });
            expect(subs.length).toBe(0);

            const resolution = await SubscriptionRouter.resolveTargetChannels({
                type: 'push',
                installationId: 1001,
                repositoryId: 5001,
                repositoryFullName: 'org-a/repo-1',
                ref: 'refs/heads/main',
            } as any);
            expect(resolution.targetChannelIds.length).toBe(0);
        });

        it('routes zero deliveries when installation is suspended or revoked', async () => {
            memoryGuildConnections.set('guild-a:1001', {
                guildId: 'guild-a',
                installationId: 1001,
                status: 'connected',
            });
            memorySubscriptions.push({
                repositoryFullName: 'org-a/repo-1',
                installationId: 1001,
                repositoryId: 5001,
                guildId: 'guild-a',
                channelId: 'chan-a',
                active: true,
                events: ['push'],
            });

            // Suspended state
            memoryInstallations.set(1001, {
                installationId: 1001,
                status: 'suspended',
                accountLogin: 'org-a',
            });
            const subsSuspended = await routeEventToSubscriptions({
                installationId: 1001,
                repositoryId: 5001,
                repositoryFullName: 'org-a/repo-1',
                type: 'push',
            });
            expect(subsSuspended.length).toBe(0);

            // Revoked state
            memoryInstallations.set(1001, {
                installationId: 1001,
                status: 'revoked',
                accountLogin: 'org-a',
            });
            const subsRevoked = await routeEventToSubscriptions({
                installationId: 1001,
                repositoryId: 5001,
                repositoryFullName: 'org-a/repo-1',
                type: 'push',
            });
            expect(subsRevoked.length).toBe(0);
        });

        it('handles unconnected guild executing /gh repo watch with GuildNotConnectedError UX', async () => {
            const watchInteraction = createMockInteraction({
                commandName: 'gh',
                group: 'repo',
                subcommand: 'watch',
                guildId: 'unconnected-guild',
                userId: 'admin-unconnected',
                permissions: PermissionFlagsBits.ManageGuild,
                stringOptions: { name: 'org-a/repo-1' },
            });

            await executeGhDispatcher(watchInteraction, false);
            expect(watchInteraction.replied).toBe(true);
            const replies = watchInteraction.getReplies();
            const replyContent = replies[0]?.content || '';
            expect(replyContent).toContain('not connected to GitHub');
            expect(replyContent).toContain('/gh connect');

            // Verify no subscription was added
            expect(memorySubscriptions.length).toBe(0);
        });

        it('handles unconnected guild executing /gh status gracefully', async () => {
            const statusInteraction = createMockInteraction({
                commandName: 'gh',
                group: null,
                subcommand: 'status',
                guildId: 'unconnected-guild-2',
                userId: 'member-unconnected',
                permissions: 0n,
            });

            await executeGhDispatcher(statusInteraction, false);
            expect(statusInteraction.replied).toBe(true);
            const reply = statusInteraction.getReplies()[0];
            const rawEmbed = reply.embeds?.[0];
            const embed = rawEmbed?.data || rawEmbed;
            expect(embed.description).toContain('No GitHub App installations are connected');
        });
    });

    // =========================================================================
    // 4. PERMISSION BYPASS PREVENTION
    // =========================================================================
    describe('Permission Bypass Prevention', () => {
        const adminMutationCommands: Array<{
            name: string;
            group: string | null;
            subcommand: string;
            stringOptions?: Record<string, string>;
        }> = [
            { name: 'gh', group: null, subcommand: 'connect' },
            { name: 'gh', group: null, subcommand: 'disconnect', stringOptions: { installation_id: '1001' } },
            { name: 'gh', group: 'repo', subcommand: 'watch', stringOptions: { name: 'org-a/repo-1' } },
            { name: 'gh', group: 'repo', subcommand: 'unwatch', stringOptions: { name: 'org-a/repo-1' } },
            { name: 'github', group: null, subcommand: 'connect' },
            { name: 'github', group: null, subcommand: 'disconnect', stringOptions: { installation_id: '1001' } },
            { name: 'github', group: 'repo', subcommand: 'watch', stringOptions: { name: 'org-a/repo-1' } },
            { name: 'github', group: 'repo', subcommand: 'unwatch', stringOptions: { name: 'org-a/repo-1' } },
        ];

        for (const cmd of adminMutationCommands) {
            it(`blocks non-admin from executing /${cmd.name} ${cmd.group ? `${cmd.group} ` : ''}${cmd.subcommand}`, async () => {
                const isDeprecated = cmd.name === 'github';
                const interaction = createMockInteraction({
                    commandName: cmd.name,
                    group: cmd.group,
                    subcommand: cmd.subcommand,
                    guildId: 'guild-perm-test',
                    userId: 'non-admin-user',
                    permissions: 0n, // No permissions
                    stringOptions: cmd.stringOptions,
                });

                await executeGhDispatcher(interaction, isDeprecated);
                expect(interaction.replied).toBe(true);
                const reply = interaction.getReplies()[0];
                expect(reply.content).toContain('Manage Server');
                expect(reply.ephemeral).toBe(true);

                if (isDeprecated) {
                    expect(reply.content).toContain(DEPRECATION_NOTICE);
                }
            });
        }

        it('allows non-admin members to execute read-only commands (/gh status, /gh repo check, /gh issues list)', async () => {
            memoryInstallations.set(1001, {
                installationId: 1001,
                status: 'active',
                accountLogin: 'org-a',
                accountType: 'Organization',
            });
            memoryGuildConnections.set('guild-perm-test:1001', {
                guildId: 'guild-perm-test',
                installationId: 1001,
                status: 'connected',
            });
            memorySubscriptions.push({
                _id: 'sub-perm-test-1',
                installationId: 1001,
                repositoryId: 101,
                repositoryFullName: 'org-a/repo-1',
                guildId: 'guild-perm-test',
                channelId: 'chan-perm-test',
                active: true,
                events: ['issues', 'pull_request', 'push'],
            });

            const readOnlyCommands: Array<{ group: string | null; subcommand: string; options?: any }> = [
                { group: null, subcommand: 'status' },
                { group: 'repo', subcommand: 'check', options: { name: 'org-a/repo-1' } },
                { group: 'issues', subcommand: 'list', options: { repo: 'org-a/repo-1' } },
            ];

            for (const cmd of readOnlyCommands) {
                const interaction = createMockInteraction({
                    commandName: 'gh',
                    group: cmd.group,
                    subcommand: cmd.subcommand,
                    guildId: 'guild-perm-test',
                    userId: 'member-user',
                    permissions: 0n, // No admin permission
                    stringOptions: cmd.options,
                });

                await executeGhDispatcher(interaction, false);
                expect(interaction.replied).toBe(true);
                const reply = interaction.getReplies()[0];
                expect(reply?.content || '').not.toContain('Manage Server');
                expect(reply?.embeds?.length).toBeGreaterThan(0);
            }
        });
    });
});
