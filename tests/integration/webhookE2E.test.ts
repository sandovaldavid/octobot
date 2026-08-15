import { describe, expect, it, beforeEach, afterEach, spyOn } from 'bun:test';
import crypto from 'crypto';
import { Server } from 'http';
import { createApp } from '../../src/app';
import { RepositorySubscriptionModel } from '../../src/models/subscription';
import { WorkflowAlertStateModel } from '../../src/models/workflowAlertState';
import { WebhookDeliveryModel } from '../../src/models/webhookDelivery';
import { discordService } from '../../src/services/discordService';
import { DiscordNotification } from '../../src/types/discord';

const TEST_SECRET = 'test-secret-key-12345';

function signPayload(payload: any, secret: string = TEST_SECRET): string {
    const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(raw);
    return `sha256=${hmac.digest('hex')}`;
}

describe('Integration - End-to-End Webhook Pipeline', () => {
    let server: Server;
    let baseUrl: string;
    let originalSecret: string | undefined;

    // In-memory persistent stores for testing E2E state
    let memorySubscriptions: any[] = [];
    let memoryWorkflowStates: Map<string, any> = new Map();
    let memoryDeliveries: Map<string, any> = new Map();

    // Captured Discord deliveries
    let deliveredNotifications: Array<{ channelId: string; notification: DiscordNotification }> = [];
    let failedChannels: Set<string> = new Set();

    beforeEach(async () => {
        originalSecret = process.env.GITHUB_WEBHOOK_SECRET;
        process.env.GITHUB_WEBHOOK_SECRET = TEST_SECRET;

        memorySubscriptions = [];
        memoryWorkflowStates = new Map();
        memoryDeliveries = new Map();
        deliveredNotifications = [];
        failedChannels = new Set();

        // 1. Mock RepositorySubscriptionModel
        spyOn(RepositorySubscriptionModel, 'find').mockImplementation((query: any) => {
            const repo = query.repositoryFullName;
            const active = query.active !== undefined ? query.active : true;

            const matches = memorySubscriptions.filter((s) => {
                if (repo && s.repositoryFullName !== repo) return false;
                if (active !== undefined && s.active !== active) return false;
                return true;
            });

            return Promise.resolve(matches) as any;
        });

        // 2. Mock WorkflowAlertStateModel
        spyOn(WorkflowAlertStateModel, 'findOne').mockImplementation((query: any) => {
            const key = `${query.repositoryFullName}:${query.workflowId}:${query.headBranch}`;
            return Promise.resolve(memoryWorkflowStates.get(key) || null) as any;
        });

        spyOn(WorkflowAlertStateModel, 'findOneAndUpdate').mockImplementation((query: any, update: any) => {
            const key = `${query.repositoryFullName}:${query.workflowId}:${query.headBranch}`;
            const existing = memoryWorkflowStates.get(key) || {};

            let updatedDoc = { ...existing };

            if (update.$set) {
                updatedDoc = { ...updatedDoc, ...update.$set };
            }
            if (update.$inc) {
                for (const [k, v] of Object.entries(update.$inc)) {
                    updatedDoc[k] = (updatedDoc[k] || 0) + (v as number);
                }
            }
            for (const [k, v] of Object.entries(update)) {
                if (!k.startsWith('$')) {
                    updatedDoc[k] = v;
                }
            }

            memoryWorkflowStates.set(key, updatedDoc);
            return Promise.resolve(updatedDoc) as any;
        });

        // 3. Mock WebhookDeliveryModel
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

            if (query.status && existing.status !== query.status) return Promise.resolve(null) as any;
            if (query.leaseExpiresAt?.$lte && existing.leaseExpiresAt > query.leaseExpiresAt.$lte) {
                return Promise.resolve(null) as any;
            }

            let updatedDoc = { ...existing };
            if (update.$set) {
                updatedDoc = { ...updatedDoc, ...update.$set };
            }
            if (update.$inc) {
                for (const [k, v] of Object.entries(update.$inc)) {
                    updatedDoc[k] = (updatedDoc[k] || 0) + (v as number);
                }
            }
            for (const [k, v] of Object.entries(update)) {
                if (!k.startsWith('$')) {
                    updatedDoc[k] = v;
                }
            }

            memoryDeliveries.set(query.deliveryId, updatedDoc);
            return Promise.resolve(updatedDoc) as any;
        });

        // 4. Mock Discord Delivery Boundary
        spyOn(discordService, 'sendNotification').mockImplementation(
            (channelId: string, notification: DiscordNotification) => {
                if (failedChannels.has(channelId)) {
                    throw new Error(`Simulated delivery error for channel ${channelId}`);
                }
                deliveredNotifications.push({ channelId, notification });
                return Promise.resolve();
            }
        );

        // 5. Start real HTTP Express App
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
        if (originalSecret !== undefined) {
            process.env.GITHUB_WEBHOOK_SECRET = originalSecret;
        } else {
            delete process.env.GITHUB_WEBHOOK_SECRET;
        }

        if (server) {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });

    async function sendWebhook({
        event,
        deliveryId,
        payload,
        signature,
        rawHeaders,
    }: {
        event?: string;
        deliveryId?: string;
        payload?: any;
        signature?: string;
        rawHeaders?: Record<string, string>;
    }): Promise<{ status: number; body: any }> {
        const bodyStr = payload !== undefined ? JSON.stringify(payload) : '';
        const sig = signature !== undefined ? signature : signPayload(bodyStr);

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(event ? { 'x-github-event': event } : {}),
            ...(deliveryId ? { 'x-github-delivery': deliveryId } : {}),
            ...(sig ? { 'x-hub-signature-256': sig } : {}),
            ...(rawHeaders || {}),
        };

        const res = await fetch(`${baseUrl}/api/webhooks/github`, {
            method: 'POST',
            headers,
            body: bodyStr,
        });

        const data = await res.json().catch(() => null);
        return { status: res.status, body: data };
    }

    /* -------------------------------------------------------------------------- */
    /* 1. INGRESS & SECURITY TESTS                                                */
    /* -------------------------------------------------------------------------- */
    describe('1. Ingress & Security', () => {
        it('debe rechazar solicitudes con firma HMAC inválida (401)', async () => {
            const res = await sendWebhook({
                event: 'push',
                deliveryId: 'sec-1',
                payload: { repository: { full_name: 'sandovaldavid/octobot' } },
                signature: 'sha256=invalidhash9999999999999999999999999999999999999999999999999999999999999999',
            });

            expect(res.status).toBe(401);
            expect(res.body.success).toBe(false);
            expect(deliveredNotifications.length).toBe(0);
            expect(memoryDeliveries.size).toBe(0); // Idempotency must not be established
        });

        it('debe rechazar solicitudes sin header x-hub-signature-256 (401)', async () => {
            const res = await sendWebhook({
                event: 'push',
                deliveryId: 'sec-2',
                payload: { repository: { full_name: 'sandovaldavid/octobot' } },
                signature: '',
            });

            expect(res.status).toBe(401);
            expect(res.body.error).toContain('signature');
        });

        it('debe rechazar solicitudes sin header x-github-event (400)', async () => {
            const res = await sendWebhook({
                deliveryId: 'sec-3',
                payload: { repository: { full_name: 'sandovaldavid/octobot' } },
            });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('x-github-event');
        });

        it('debe rechazar solicitudes sin header x-github-delivery (400)', async () => {
            const res = await sendWebhook({
                event: 'push',
                payload: { repository: { full_name: 'sandovaldavid/octobot' } },
            });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('x-github-delivery');
        });

        it('debe procesar exitosamente eventos ping firmados sin alertar a Discord (200)', async () => {
            const res = await sendWebhook({
                event: 'ping',
                deliveryId: 'ping-1',
                payload: { zen: 'Practicality beats purity.', hook_id: 1234 },
            });

            expect(res.status).toBe(200);
            expect(res.body.outcome).toBe('ignored_ping');
            expect(deliveredNotifications.length).toBe(0);
            expect(memoryDeliveries.get('ping-1')?.status).toBe('completed');
        });
    });

    /* -------------------------------------------------------------------------- */
    /* 2. PULL REQUEST FLOWS                                                      */
    /* -------------------------------------------------------------------------- */
    describe('2. Pull Request Flows', () => {
        beforeEach(() => {
            memorySubscriptions.push({
                repositoryFullName: 'sandovaldavid/octobot',
                channelId: 'channel-pr',
                events: ['pull_request'],
                active: true,
            });
        });

        it('debe procesar y entregar PR opened', async () => {
            const res = await sendWebhook({
                event: 'pull_request',
                deliveryId: 'pr-open-1',
                payload: {
                    action: 'opened',
                    repository: { full_name: 'sandovaldavid/octobot' },
                    pull_request: {
                        number: 42,
                        title: 'feat: add awesome feature',
                        body: 'PR description',
                        html_url: 'https://github.com/sandovaldavid/octobot/pull/42',
                        head: { ref: 'feat/awesome' },
                        base: { ref: 'develop' },
                        additions: 100,
                        deletions: 20,
                        merged: false,
                        user: { login: 'david', avatar_url: 'https://avatar.url' },
                    },
                },
            });

            expect(res.status).toBe(200);
            expect(res.body.outcome).toBe('delivered');
            expect(res.body.delivered).toBe(1);

            expect(deliveredNotifications.length).toBe(1);
            expect(deliveredNotifications[0].channelId).toBe('channel-pr');
            expect(deliveredNotifications[0].notification.title).toContain('PR #42 Opened');
            expect(memoryDeliveries.get('pr-open-1')?.status).toBe('completed');
        });

        it('debe procesar y entregar PR ready_for_review con estado visual diferenciado', async () => {
            const res = await sendWebhook({
                event: 'pull_request',
                deliveryId: 'pr-ready-1',
                payload: {
                    action: 'ready_for_review',
                    repository: { full_name: 'sandovaldavid/octobot' },
                    pull_request: {
                        number: 42,
                        title: 'feat: ready now',
                        head: { ref: 'feat/awesome' },
                        base: { ref: 'develop' },
                        additions: 50,
                        deletions: 10,
                        user: { login: 'david' },
                    },
                },
            });

            expect(res.status).toBe(200);
            expect(deliveredNotifications.length).toBe(1);
            expect(deliveredNotifications[0].notification.title).toContain('🟣 PR #42 Ready for Review');
        });

        it('debe procesar y entregar PR merged con atribución', async () => {
            const res = await sendWebhook({
                event: 'pull_request',
                deliveryId: 'pr-merged-1',
                payload: {
                    action: 'closed',
                    repository: { full_name: 'sandovaldavid/octobot' },
                    pull_request: {
                        number: 42,
                        title: 'feat: merge me',
                        head: { ref: 'feat/awesome' },
                        base: { ref: 'develop' },
                        merged: true,
                        merged_by: { login: 'octo-maintainer' },
                        user: { login: 'david' },
                    },
                },
            });

            expect(res.status).toBe(200);
            expect(deliveredNotifications.length).toBe(1);
            expect(deliveredNotifications[0].notification.title).toContain('🟢 PR #42 Merged');
        });

        it('debe filtrar PR synchronize sin notificar a Discord (noise filtered)', async () => {
            const res = await sendWebhook({
                event: 'pull_request',
                deliveryId: 'pr-sync-1',
                payload: {
                    action: 'synchronize',
                    repository: { full_name: 'sandovaldavid/octobot' },
                    pull_request: {
                        number: 42,
                        title: 'feat: synchronize commit',
                        head: { ref: 'feat/awesome' },
                        base: { ref: 'develop' },
                    },
                },
            });

            expect(res.status).toBe(200);
            expect(res.body.outcome).toBe('ignored_policy');
            expect(deliveredNotifications.length).toBe(0);
            expect(memoryDeliveries.get('pr-sync-1')?.status).toBe('completed');
        });
    });

    /* -------------------------------------------------------------------------- */
    /* 3. PULL REQUEST REVIEW FLOWS                                               */
    /* -------------------------------------------------------------------------- */
    describe('3. Pull Request Review Flows', () => {
        beforeEach(() => {
            memorySubscriptions.push({
                repositoryFullName: 'sandovaldavid/octobot',
                channelId: 'channel-reviews',
                events: ['pull_request_review'],
                active: true,
            });
        });

        it('debe procesar y entregar review approved (✅ verde)', async () => {
            const res = await sendWebhook({
                event: 'pull_request_review',
                deliveryId: 'rev-app-1',
                payload: {
                    action: 'submitted',
                    repository: { full_name: 'sandovaldavid/octobot' },
                    review: {
                        state: 'APPROVED',
                        body: 'Ship it!',
                        user: { login: 'senior-reviewer' },
                    },
                    pull_request: {
                        number: 42,
                        title: 'Refactor Architecture',
                        head: { ref: 'feat/arch' },
                        base: { ref: 'develop' },
                    },
                },
            });

            expect(res.status).toBe(200);
            expect(res.body.outcome).toBe('delivered');
            expect(deliveredNotifications.length).toBe(1);
            expect(deliveredNotifications[0].notification.title).toContain('✅ PR #42 Approved');
        });

        it('debe procesar y entregar review changes_requested (🔴 rojo)', async () => {
            const res = await sendWebhook({
                event: 'pull_request_review',
                deliveryId: 'rev-cr-1',
                payload: {
                    action: 'submitted',
                    repository: { full_name: 'sandovaldavid/octobot' },
                    review: {
                        state: 'CHANGES_REQUESTED',
                        body: 'Please add tests for edge case',
                        user: { login: 'strict-reviewer' },
                    },
                    pull_request: {
                        number: 42,
                        title: 'Refactor Architecture',
                        head: { ref: 'feat/arch' },
                        base: { ref: 'develop' },
                    },
                },
            });

            expect(res.status).toBe(200);
            expect(deliveredNotifications.length).toBe(1);
            expect(deliveredNotifications[0].notification.title).toContain('🔴 Changes Requested');
        });

        it('debe filtrar review commented sin notificar a Discord', async () => {
            const res = await sendWebhook({
                event: 'pull_request_review',
                deliveryId: 'rev-comm-1',
                payload: {
                    action: 'submitted',
                    repository: { full_name: 'sandovaldavid/octobot' },
                    review: {
                        state: 'COMMENTED',
                        body: 'Just a thought',
                        user: { login: 'curious-dev' },
                    },
                    pull_request: {
                        number: 42,
                        title: 'Refactor Architecture',
                        head: { ref: 'feat/arch' },
                        base: { ref: 'develop' },
                    },
                },
            });

            expect(res.status).toBe(200);
            expect(res.body.outcome).toBe('ignored_policy');
            expect(deliveredNotifications.length).toBe(0);
        });

        it('debe rechazar payloads de review malformados con 400 invalid_payload', async () => {
            const res = await sendWebhook({
                event: 'pull_request_review',
                deliveryId: 'rev-bad-1',
                payload: {
                    action: 'submitted',
                    repository: { full_name: 'sandovaldavid/octobot' },
                },
            });

            expect(res.status).toBe(400);
            expect(res.body.outcome).toBe('invalid_payload');
            expect(memoryDeliveries.get('rev-bad-1')?.status).toBe('rejected');
        });
    });

    /* -------------------------------------------------------------------------- */
    /* 4. ROUTING & FAN-OUT TESTS                                                 */
    /* -------------------------------------------------------------------------- */
    describe('4. Routing & Fan-out Isolation', () => {
        it('debe realizar fan-out entregando a múltiples canales para un mismo repo', async () => {
            memorySubscriptions.push(
                {
                    repositoryFullName: 'sandovaldavid/octobot',
                    channelId: 'channel-1',
                    events: ['push'],
                    active: true,
                },
                {
                    repositoryFullName: 'sandovaldavid/octobot',
                    channelId: 'channel-2',
                    events: ['push'],
                    active: true,
                }
            );

            const res = await sendWebhook({
                event: 'push',
                deliveryId: 'fanout-1',
                payload: {
                    ref: 'refs/heads/main',
                    repository: { full_name: 'sandovaldavid/octobot' },
                    commits: [{ id: 'abc', message: 'test' }],
                },
            });

            expect(res.status).toBe(200);
            expect(res.body.delivered).toBe(2);
            expect(deliveredNotifications.length).toBe(2);
            expect(deliveredNotifications.map((n) => n.channelId)).toEqual(['channel-1', 'channel-2']);
        });

        it('debe aislar repositorios con mismo nombre corto pero diferente owner (owner-a/api vs owner-b/api)', async () => {
            memorySubscriptions.push({
                repositoryFullName: 'owner-a/api',
                channelId: 'channel-owner-a',
                events: ['push'],
                active: true,
            });

            const res = await sendWebhook({
                event: 'push',
                deliveryId: 'isolation-1',
                payload: {
                    ref: 'refs/heads/main',
                    repository: { full_name: 'owner-b/api' },
                    commits: [{ id: '123', message: 'test' }],
                },
            });

            expect(res.status).toBe(200);
            expect(res.body.outcome).toBe('ignored_no_subscription');
            expect(deliveredNotifications.length).toBe(0);
        });

        it('debe manejar partial_delivery cuando un canal falla y otro tiene éxito', async () => {
            memorySubscriptions.push(
                {
                    repositoryFullName: 'sandovaldavid/octobot',
                    channelId: 'channel-good',
                    events: ['push'],
                    active: true,
                },
                {
                    repositoryFullName: 'sandovaldavid/octobot',
                    channelId: 'channel-failing',
                    events: ['push'],
                    active: true,
                }
            );

            failedChannels.add('channel-failing');

            const res = await sendWebhook({
                event: 'push',
                deliveryId: 'partial-1',
                payload: {
                    ref: 'refs/heads/main',
                    repository: { full_name: 'sandovaldavid/octobot' },
                    commits: [{ id: 'abc', message: 'test' }],
                },
            });

            expect(res.status).toBe(200);
            expect(res.body.outcome).toBe('partial_delivery');
            expect(res.body.delivered).toBe(1);
            expect(deliveredNotifications.length).toBe(1);
            expect(deliveredNotifications[0].channelId).toBe('channel-good');
            expect(memoryDeliveries.get('partial-1')?.status).toBe('completed');
        });
    });

    /* -------------------------------------------------------------------------- */
    /* 5. IDEMPOTENCY & REPLAY PROTECTION                                         */
    /* -------------------------------------------------------------------------- */
    describe('5. Idempotency & Replay Protection', () => {
        beforeEach(() => {
            memorySubscriptions.push({
                repositoryFullName: 'sandovaldavid/octobot',
                channelId: 'channel-main',
                events: ['push'],
                active: true,
            });
        });

        it('debe evitar notificaciones duplicadas en redelivery de un webhook ya completado (HTTP 200 duplicate)', async () => {
            const payload = {
                ref: 'refs/heads/main',
                repository: { full_name: 'sandovaldavid/octobot' },
                commits: [{ id: 'c1', message: 'Initial commit' }],
            };

            // First delivery -> processed and delivered
            const res1 = await sendWebhook({
                event: 'push',
                deliveryId: 'idem-guid-1',
                payload,
            });

            expect(res1.status).toBe(200);
            expect(res1.body.delivered).toBe(1);
            expect(deliveredNotifications.length).toBe(1);

            // Replay with exact same X-GitHub-Delivery
            const res2 = await sendWebhook({
                event: 'push',
                deliveryId: 'idem-guid-1',
                payload,
            });

            expect(res2.status).toBe(200);
            expect(res2.body.duplicate).toBe(true);
            expect(res2.body.outcome).toBe('delivered');
            // Notification count MUST remain 1!
            expect(deliveredNotifications.length).toBe(1);
        });

        it('debe responder 202 para solicitudes concurrentes en vuelo con lease activo', async () => {
            memoryDeliveries.set('inflight-guid-1', {
                deliveryId: 'inflight-guid-1',
                eventName: 'push',
                status: 'processing',
                leaseExpiresAt: new Date(Date.now() + 30000),
            });

            const res = await sendWebhook({
                event: 'push',
                deliveryId: 'inflight-guid-1',
                payload: {
                    ref: 'refs/heads/main',
                    repository: { full_name: 'sandovaldavid/octobot' },
                    commits: [],
                },
            });

            expect(res.status).toBe(202);
            expect(res.body.duplicate).toBe(true);
            expect(res.body.status).toBe('in_flight');
            expect(deliveredNotifications.length).toBe(0);
        });

        it('debe responder 503 (Fail-Closed) si la base de datos de idempotencia no está disponible', async () => {
            spyOn(WebhookDeliveryModel, 'create').mockRejectedValue(new Error('MongoDB cluster unreachable'));

            const res = await sendWebhook({
                event: 'push',
                deliveryId: 'failclosed-guid-1',
                payload: {
                    ref: 'refs/heads/main',
                    repository: { full_name: 'sandovaldavid/octobot' },
                    commits: [],
                },
            });

            expect(res.status).toBe(503);
            expect(res.body.success).toBe(false);
            expect(res.body.error).toContain('failed to establish delivery idempotency claim');
            expect(deliveredNotifications.length).toBe(0);
        });
    });

    /* -------------------------------------------------------------------------- */
    /* 6. CI/CD WORKFLOW RUN FAILURE & RECOVERY SEQUENCE                          */
    /* -------------------------------------------------------------------------- */
    describe('6. CI/CD Workflow Run Failure & Recovery', () => {
        beforeEach(() => {
            memorySubscriptions.push({
                repositoryFullName: 'sandovaldavid/octobot',
                channelId: 'channel-ci',
                events: ['workflow_run'],
                active: true,
            });
        });

        it('debe ejecutar la secuencia completa: Failure 🔴 -> Repeated Failure Ignored -> Recovery 🟢', async () => {
            const baseWf = {
                id: 1001,
                workflow_id: 888,
                name: 'CI / Test & Build',
                head_branch: 'develop',
                head_sha: 'commit1234567',
                run_number: 10,
                run_attempt: 1,
            };

            // 1. Initial Failure -> Must Notify 🔴
            const resFail1 = await sendWebhook({
                event: 'workflow_run',
                deliveryId: 'wf-fail-1',
                payload: {
                    action: 'completed',
                    repository: { full_name: 'sandovaldavid/octobot' },
                    workflow_run: { ...baseWf, conclusion: 'failure' },
                    sender: { login: 'ci-bot' },
                },
            });

            expect(resFail1.status).toBe(200);
            expect(resFail1.body.outcome).toBe('delivered');
            expect(deliveredNotifications.length).toBe(1);
            expect(deliveredNotifications[0].notification.title).toContain('🔴 CI Failed — CI / Test & Build');

            // 2. Repeated Failure -> Must be suppressed (outcome: ignored_policy)
            const resFail2 = await sendWebhook({
                event: 'workflow_run',
                deliveryId: 'wf-fail-2',
                payload: {
                    action: 'completed',
                    repository: { full_name: 'sandovaldavid/octobot' },
                    workflow_run: { ...baseWf, run_number: 11, conclusion: 'failure' },
                    sender: { login: 'ci-bot' },
                },
            });

            expect(resFail2.status).toBe(200);
            expect(resFail2.body.outcome).toBe('ignored_policy');
            expect(deliveredNotifications.length).toBe(1); // No second failure notification

            // 3. Recovery (Success after failure) -> Must Notify 🟢
            const resRec = await sendWebhook({
                event: 'workflow_run',
                deliveryId: 'wf-rec-1',
                payload: {
                    action: 'completed',
                    repository: { full_name: 'sandovaldavid/octobot' },
                    workflow_run: { ...baseWf, run_number: 12, conclusion: 'success' },
                    sender: { login: 'ci-bot' },
                },
            });

            expect(resRec.status).toBe(200);
            expect(resRec.body.outcome).toBe('delivered');
            expect(deliveredNotifications.length).toBe(2);
            expect(deliveredNotifications[1].notification.title).toContain('🟢 CI Recovered — CI / Test & Build');

            // 4. Healthy Success -> Must be suppressed
            const resHealthy = await sendWebhook({
                event: 'workflow_run',
                deliveryId: 'wf-healthy-1',
                payload: {
                    action: 'completed',
                    repository: { full_name: 'sandovaldavid/octobot' },
                    workflow_run: { ...baseWf, run_number: 13, conclusion: 'success' },
                    sender: { login: 'ci-bot' },
                },
            });

            expect(resHealthy.status).toBe(200);
            expect(resHealthy.body.outcome).toBe('ignored_policy');
            expect(deliveredNotifications.length).toBe(2); // No alert for routine success
        });
    });

    /* -------------------------------------------------------------------------- */
    /* 7. REGRESSION & HEALTH ENDPOINT                                            */
    /* -------------------------------------------------------------------------- */
    describe('7. Regression & Health', () => {
        it('debe responder 200 OK en /health con el estado de conectividad sin credenciales', async () => {
            const res = await fetch(`${baseUrl}/health`);
            expect(res.status).toBe(200);
            const data: any = await res.json();
            expect(data.status).toBe('OK');
            expect(data.discord).toBe('Connected');
            expect(data.webhook).toBe('Configured');
            expect(data.database).toBe('Connected');
            expect(data.timestamp).toBeDefined();
        });

        it('debe procesar y entregar eventos de issues abiertos', async () => {
            memorySubscriptions.push({
                repositoryFullName: 'sandovaldavid/octobot',
                channelId: 'channel-issues',
                events: ['issues'],
                active: true,
            });

            const res = await sendWebhook({
                event: 'issues',
                deliveryId: 'issue-1',
                payload: {
                    action: 'opened',
                    repository: { full_name: 'sandovaldavid/octobot' },
                    issue: {
                        number: 99,
                        title: 'Test Bug',
                        body: 'Bug description',
                        state: 'open',
                        labels: [],
                        user: { login: 'tester' },
                    },
                },
            });

            expect(res.status).toBe(200);
            expect(deliveredNotifications.length).toBe(1);
            expect(deliveredNotifications[0].notification.title).toContain('Issue #99 opened');
        });

        it('debe procesar y entregar eventos de release publicado', async () => {
            memorySubscriptions.push({
                repositoryFullName: 'sandovaldavid/octobot',
                channelId: 'channel-releases',
                events: ['release'],
                active: true,
            });

            const res = await sendWebhook({
                event: 'release',
                deliveryId: 'rel-1',
                payload: {
                    action: 'published',
                    repository: { full_name: 'sandovaldavid/octobot' },
                    release: {
                        tag_name: 'v1.0.0',
                        name: 'V1 Initial Release',
                        author: { login: 'release-manager' },
                        prerelease: false,
                    },
                },
            });

            expect(res.status).toBe(200);
            expect(deliveredNotifications.length).toBe(1);
            expect(deliveredNotifications[0].notification.title).toContain(
                'New Release in sandovaldavid/octobot: v1.0.0'
            );
        });
    });
});
