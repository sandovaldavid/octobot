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
import { EventProcessor } from '@/pipeline/processor';
import type { DiscordNotification } from '@/types/discord';
import { DEPRECATION_NOTICE } from '@services/discord/commandResponseDecorator';

const TEST_SECRET = 'test-e2e-webhook-secret-key-12345';
const TEST_APP_ID = 123456;
const TEST_PRIVATE_KEY = '-----BEGIN RSA PRIVATE KEY-----\nMIIEfakeKeyForTesting\n-----END RSA PRIVATE KEY-----';
const TEST_CLIENT_ID = 'Iv1.test_client_id';
const TEST_CLIENT_SECRET = 'test_client_secret';

function signPayload(payload: any, secret: string = TEST_SECRET): string {
    const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(raw);
    return `sha256=${hmac.digest('hex')}`;
}

describe('Integration - Multi-Tenant End-to-End Suite', () => {
    let server: Server;
    let baseUrl: string;
    let originalEnv: Record<string, string | undefined>;

    // In-memory database tables
    let memoryAttempts: Map<string, any> = new Map();
    let memoryInstallations: Map<number, any> = new Map();
    let memoryGuildConnections: Map<string, any> = new Map(); // key: `${guildId}:${installationId}`
    let memorySubscriptions: any[] = [];
    let memoryDeliveries: Map<string, any> = new Map();

    // Captured Discord delivery boundary
    let deliveredNotifications: Array<{ channelId: string; notification: DiscordNotification }> = [];

    // Original fetch
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

        // 6. Mock Discord notification delivery boundary
        spyOn(discordService, 'sendNotification').mockImplementation((channelId: string, notification: any) => {
            deliveredNotifications.push({ channelId, notification });
            return Promise.resolve();
        });

        // 7. Mock global fetch for GitHub OAuth and Octokit user API
        globalThis.fetch = mock(async (url: any, init?: any) => {
            const urlStr = String(url);
            if (urlStr.includes('/login/oauth/access_token')) {
                const body = JSON.parse(String(init?.body || '{}'));
                const token = body.code === 'valid-code-b' ? 'gho_token_b' : 'gho_token_a';
                return new Response(JSON.stringify({ access_token: token, token_type: 'bearer' }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            if (urlStr.includes('/user/installations')) {
                const auth = (init?.headers as any)?.Authorization || '';
                if (auth.includes('gho_token_b')) {
                    return new Response(
                        JSON.stringify({
                            total_count: 1,
                            installations: [
                                {
                                    id: 1002,
                                    account: { id: 202, login: 'org-b', type: 'Organization' },
                                    repository_selection: 'all',
                                    permissions: { issues: 'write', contents: 'read' },
                                    events: ['push', 'issues'],
                                },
                            ],
                        }),
                        { status: 200, headers: { 'Content-Type': 'application/json' } }
                    );
                }

                return new Response(
                    JSON.stringify({
                        total_count: 1,
                        installations: [
                            {
                                id: 1001,
                                account: { id: 101, login: 'org-a', type: 'Organization' },
                                repository_selection: 'all',
                                permissions: { issues: 'write', contents: 'read' },
                                events: ['push', 'issues'],
                            },
                        ],
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }
                );
            }

            return nativeFetch(url, init);
        });

        // 8. Mock ClientResolver
        const clientResolver = getGitHubClientResolver();
        spyOn(clientResolver, 'forInstallation').mockImplementation(async (installationId: number) => {
            if (installationId === 1001) {
                return {
                    rest: {
                        repos: {
                            get: mock(async ({ owner, repo }: any) => ({
                                data: {
                                    id: 5001,
                                    name: repo,
                                    full_name: `${owner}/${repo}`,
                                    html_url: `https://github.com/${owner}/${repo}`,
                                },
                            })),
                        },
                        issues: {
                            listForRepo: mock(async () => ({ data: [] })),
                        },
                        apps: {
                            listReposAccessibleToInstallation: mock(async () => ({
                                data: { repositories: [{ id: 5001 }] },
                            })),
                        },
                    },
                } as any;
            }

            if (installationId === 1002) {
                return {
                    rest: {
                        repos: {
                            get: mock(async ({ owner, repo }: any) => ({
                                data: {
                                    id: 5002,
                                    name: repo,
                                    full_name: `${owner}/${repo}`,
                                    html_url: `https://github.com/${owner}/${repo}`,
                                },
                            })),
                        },
                        issues: {
                            listForRepo: mock(async () => ({ data: [] })),
                        },
                        apps: {
                            listReposAccessibleToInstallation: mock(async () => ({
                                data: { repositories: [{ id: 5002 }] },
                            })),
                        },
                    },
                } as any;
            }

            throw new Error(`Unexpected installationId: ${installationId}`);
        });

        EventProcessor.setClientResolver(clientResolver);

        // 9. Start Express App
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
        guildId = 'guild-a',
        channelId = 'channel-a',
        userId = 'admin-a',
        permissions = PermissionFlagsBits.ManageGuild,
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

    async function sendSignedWebhook(event: string, deliveryId: string, payload: any) {
        const bodyStr = JSON.stringify(payload);
        const sig = signPayload(bodyStr);

        return nativeFetch(`${baseUrl}/api/webhooks/github`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-github-event': event,
                'x-github-delivery': deliveryId,
                'x-hub-signature-256': sig,
            },
            body: bodyStr,
        });
    }

    it('executes complete multi-tenant lifecycle: onboarding, subscriptions, routing isolation, status commands & lifecycle events', async () => {
        // =========================================================================
        // 1. ONBOARDING HANDSHAKE FLOW (Guild A -> 1001 & Guild B -> 1002)
        // =========================================================================

        // --- Guild A Onboarding ---
        const connectInteractionA = createMockInteraction({
            commandName: 'gh',
            group: null,
            subcommand: 'connect',
            guildId: 'guild-a',
            userId: 'admin-a',
        });
        await executeGhDispatcher(connectInteractionA, false);
        expect(connectInteractionA.replied).toBe(true);
        const replyA = connectInteractionA.getReplies()[0];
        expect(replyA.embeds?.[0]?.data?.description).toContain('installations/new?state=');

        // Extract installNonceA from embed
        const matchNonceA = replyA.embeds[0].data.description.match(/state=([a-f0-9]+)/);
        expect(matchNonceA).toBeTruthy();
        const installNonceA = matchNonceA![1];

        // HTTP GET /api/github/setup for Guild A (installation 1001)
        const setupResA = await nativeFetch(`${baseUrl}/api/github/setup?installation_id=1001&state=${installNonceA}`, {
            redirect: 'manual',
        });
        expect(setupResA.status).toBe(302);
        const oauthLocationA = setupResA.headers.get('location');
        expect(oauthLocationA).toContain('https://github.com/login/oauth/authorize?');

        const oauthUrlA = new URL(oauthLocationA!);
        const oauthNonceA = oauthUrlA.searchParams.get('state');
        const codeChallengeA = oauthUrlA.searchParams.get('code_challenge');
        expect(oauthNonceA).toBeTruthy();
        expect(codeChallengeA).toBeTruthy();

        // HTTP GET /api/github/callback for Guild A
        const callbackResA = await nativeFetch(`${baseUrl}/api/github/callback?code=valid-code-a&state=${oauthNonceA}`);
        expect(callbackResA.status).toBe(200);
        const htmlA = await callbackResA.text();
        expect(htmlA).toContain('OctoBot Connected!');

        // Verify Guild A entities in DB
        const installationA = memoryInstallations.get(1001);
        expect(installationA).toBeDefined();
        expect(installationA.status).toBe('active');
        expect(installationA.accountLogin).toBe('org-a');

        const guildConnA = memoryGuildConnections.get('guild-a:1001');
        expect(guildConnA).toBeDefined();
        expect(guildConnA.status).toBe('connected');

        // --- Guild B Onboarding ---
        const connectInteractionB = createMockInteraction({
            commandName: 'gh',
            group: null,
            subcommand: 'connect',
            guildId: 'guild-b',
            userId: 'admin-b',
        });
        await executeGhDispatcher(connectInteractionB, false);
        const replyB = connectInteractionB.getReplies()[0];
        const matchNonceB = replyB.embeds[0].data.description.match(/state=([a-f0-9]+)/);
        const installNonceB = matchNonceB![1];

        const setupResB = await nativeFetch(`${baseUrl}/api/github/setup?installation_id=1002&state=${installNonceB}`, {
            redirect: 'manual',
        });
        expect(setupResB.status).toBe(302);
        const oauthLocationB = setupResB.headers.get('location');
        const oauthUrlB = new URL(oauthLocationB!);
        const oauthNonceB = oauthUrlB.searchParams.get('state');

        const callbackResB = await nativeFetch(`${baseUrl}/api/github/callback?code=valid-code-b&state=${oauthNonceB}`);
        expect(callbackResB.status).toBe(200);

        const installationB = memoryInstallations.get(1002);
        expect(installationB).toBeDefined();
        expect(installationB.status).toBe('active');
        expect(installationB.accountLogin).toBe('org-b');

        const guildConnB = memoryGuildConnections.get('guild-b:1002');
        expect(guildConnB).toBeDefined();
        expect(guildConnB.status).toBe('connected');

        // =========================================================================
        // 2. CHANNEL SUBSCRIPTION FLOW (Guild A -> org-a/repo-1, Guild B -> org-b/repo-2)
        // =========================================================================

        const watchInteractionA = createMockInteraction({
            commandName: 'gh',
            group: 'repo',
            subcommand: 'watch',
            guildId: 'guild-a',
            channelId: 'channel-a',
            userId: 'admin-a',
            stringOptions: { name: 'org-a/repo-1', events: 'push,issues' },
        });
        await executeGhDispatcher(watchInteractionA, false);
        expect(watchInteractionA.replied).toBe(true);

        expect(memorySubscriptions.length).toBe(1);
        expect(memorySubscriptions[0].repositoryFullName).toBe('org-a/repo-1');
        expect(memorySubscriptions[0].installationId).toBe(1001);
        expect(memorySubscriptions[0].repositoryId).toBe(5001);
        expect(memorySubscriptions[0].guildId).toBe('guild-a');
        expect(memorySubscriptions[0].channelId).toBe('channel-a');
        expect(memorySubscriptions[0].active).toBe(true);

        const watchInteractionB = createMockInteraction({
            commandName: 'gh',
            group: 'repo',
            subcommand: 'watch',
            guildId: 'guild-b',
            channelId: 'channel-b',
            userId: 'admin-b',
            stringOptions: { name: 'org-b/repo-2', events: 'push,issues' },
        });
        await executeGhDispatcher(watchInteractionB, false);
        expect(watchInteractionB.replied).toBe(true);

        expect(memorySubscriptions.length).toBe(2);
        expect(memorySubscriptions[1].repositoryFullName).toBe('org-b/repo-2');
        expect(memorySubscriptions[1].installationId).toBe(1002);
        expect(memorySubscriptions[1].repositoryId).toBe(5002);
        expect(memorySubscriptions[1].guildId).toBe('guild-b');
        expect(memorySubscriptions[1].channelId).toBe('channel-b');
        expect(memorySubscriptions[1].active).toBe(true);

        // =========================================================================
        // 3. MULTI-TENANT WEBHOOK INGESTION & DELIVERY ISOLATION
        // =========================================================================

        deliveredNotifications = [];

        // Deliver push event for Guild A (org-a/repo-1, installation 1001)
        const webhookResA = await sendSignedWebhook('push', 'delivery-a-1', {
            ref: 'refs/heads/main',
            repository: { id: 5001, full_name: 'org-a/repo-1', name: 'repo-1' },
            installation: { id: 1001 },
            pusher: { name: 'alice' },
            commits: [{ id: 'c1', message: 'feat: add login', url: 'https://github.com/org-a/repo-1/commit/c1' }],
            head_commit: { id: 'c1', message: 'feat: add login', url: 'https://github.com/org-a/repo-1/commit/c1' },
        });
        expect(webhookResA.status).toBe(200);

        // Wait a tick for async event processing
        await new Promise((r) => setTimeout(r, 50));

        // Delivery must hit Channel A and ZERO deliveries to Channel B
        expect(deliveredNotifications.length).toBe(1);
        expect(deliveredNotifications[0].channelId).toBe('channel-a');

        // Deliver push event for Guild B (org-b/repo-2, installation 1002)
        deliveredNotifications = [];
        const webhookResB = await sendSignedWebhook('push', 'delivery-b-1', {
            ref: 'refs/heads/main',
            repository: { id: 5002, full_name: 'org-b/repo-2', name: 'repo-2' },
            installation: { id: 1002 },
            pusher: { name: 'bob' },
            commits: [{ id: 'c2', message: 'fix: typo', url: 'https://github.com/org-b/repo-2/commit/c2' }],
            head_commit: { id: 'c2', message: 'fix: typo', url: 'https://github.com/org-b/repo-2/commit/c2' },
        });
        expect(webhookResB.status).toBe(200);

        await new Promise((r) => setTimeout(r, 50));

        // Delivery must hit Channel B and ZERO deliveries to Channel A
        expect(deliveredNotifications.length).toBe(1);
        expect(deliveredNotifications[0].channelId).toBe('channel-b');

        // =========================================================================
        // 4. COMMAND EXECUTION FLOW (/gh status vs /github status)
        // =========================================================================

        // Canonical /gh status
        const statusInteractionCanonical = createMockInteraction({
            commandName: 'gh',
            group: null,
            subcommand: 'status',
            guildId: 'guild-a',
            userId: 'member-a',
            permissions: 0n, // Regular member
        });
        await executeGhDispatcher(statusInteractionCanonical, false);
        const statusReplyCanonical = statusInteractionCanonical.getReplies()[0];
        const rawEmbedCanonical = statusReplyCanonical.embeds?.[0];
        const embedCanonical = rawEmbedCanonical?.data || rawEmbedCanonical;
        expect(embedCanonical).toBeDefined();
        expect(embedCanonical.fields.find((f: any) => f.name.includes('Installations')).value).toContain('org-a');
        expect(embedCanonical.fields.find((f: any) => f.name.includes('Subscriptions')).value).toContain(
            'org-a/repo-1'
        );
        expect(embedCanonical.footer?.text).toBeUndefined();

        // Deprecated /github status
        const statusInteractionDeprecated = createMockInteraction({
            commandName: 'github',
            group: null,
            subcommand: 'status',
            guildId: 'guild-a',
            userId: 'member-a',
            permissions: 0n, // Regular member
        });
        await executeGhDispatcher(statusInteractionDeprecated, true);
        const statusReplyDeprecated = statusInteractionDeprecated.getReplies()[0];
        const rawEmbedDeprecated = statusReplyDeprecated.embeds?.[0];
        const embedDeprecated = rawEmbedDeprecated?.data || rawEmbedDeprecated;
        expect(embedDeprecated).toBeDefined();
        expect(embedDeprecated.fields.find((f: any) => f.name.includes('Installations')).value).toContain('org-a');
        expect(embedDeprecated.footer?.text).toBe(DEPRECATION_NOTICE);

        // =========================================================================
        // 5. LIFECYCLE EVENT UPDATES (suspend, unsuspend, repository removal)
        // =========================================================================

        // --- Suspend Installation 1001 ---
        const suspendRes = await sendSignedWebhook('installation', 'delivery-suspend-1', {
            action: 'suspend',
            installation: { id: 1001 },
        });
        expect(suspendRes.status).toBe(200);
        await new Promise((r) => setTimeout(r, 50));

        expect(memoryInstallations.get(1001).status).toBe('suspended');

        // Further webhook deliveries for 1001 must FAIL-CLOSED (0 deliveries)
        deliveredNotifications = [];
        await sendSignedWebhook('push', 'delivery-a-2', {
            ref: 'refs/heads/main',
            repository: { id: 5001, full_name: 'org-a/repo-1' },
            installation: { id: 1001 },
            pusher: { name: 'alice' },
            commits: [{ id: 'c3', message: 'test' }],
            head_commit: { id: 'c3', message: 'test' },
        });
        await new Promise((r) => setTimeout(r, 50));
        expect(deliveredNotifications.length).toBe(0);

        // --- Unsuspend Installation 1001 ---
        const unsuspendRes = await sendSignedWebhook('installation', 'delivery-unsuspend-1', {
            action: 'unsuspend',
            installation: { id: 1001 },
        });
        expect(unsuspendRes.status).toBe(200);
        await new Promise((r) => setTimeout(r, 50));

        expect(memoryInstallations.get(1001).status).toBe('active');

        // Webhooks resume normal delivery
        deliveredNotifications = [];
        await sendSignedWebhook('push', 'delivery-a-3', {
            ref: 'refs/heads/main',
            repository: { id: 5001, full_name: 'org-a/repo-1' },
            installation: { id: 1001 },
            pusher: { name: 'alice' },
            commits: [{ id: 'c4', message: 'resumed delivery' }],
            head_commit: { id: 'c4', message: 'resumed delivery' },
        });
        await new Promise((r) => setTimeout(r, 50));
        expect(deliveredNotifications.length).toBe(1);
        expect(deliveredNotifications[0].channelId).toBe('channel-a');

        // --- Remove Repository org-a/repo-1 ---
        const removeRepoRes = await sendSignedWebhook('installation_repositories', 'delivery-repo-rem-1', {
            action: 'removed',
            installation: { id: 1001 },
            repositories_removed: [{ id: 5001, full_name: 'org-a/repo-1' }],
        });
        expect(removeRepoRes.status).toBe(200);
        await new Promise((r) => setTimeout(r, 50));

        const subA = memorySubscriptions.find((s) => s.repositoryId === 5001);
        expect(subA.active).toBe(false);

        // Webhook for removed repo delivers 0
        deliveredNotifications = [];
        await sendSignedWebhook('push', 'delivery-a-4', {
            ref: 'refs/heads/main',
            repository: { id: 5001, full_name: 'org-a/repo-1' },
            installation: { id: 1001 },
            pusher: { name: 'alice' },
            commits: [{ id: 'c5', message: 'after remove' }],
            head_commit: { id: 'c5', message: 'after remove' },
        });
        await new Promise((r) => setTimeout(r, 50));
        expect(deliveredNotifications.length).toBe(0);
    });
});
