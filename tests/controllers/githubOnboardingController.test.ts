import { beforeEach, describe, expect, it, mock } from 'bun:test';
import crypto from 'crypto';
import type { Request, Response } from 'express';
import { createOnboardingController } from '../../src/controllers/githubOnboardingController';
import type { GitHubAppConfig } from '../../src/config/githubAppConfig';

describe('Controller - GitHubOnboardingController', () => {
    const appConfig: GitHubAppConfig = {
        appId: 123456,
        privateKey: '-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----',
        webhookSecret: 'test-secret',
        clientId: 'Iv1.test_client_id',
        clientSecret: 'test_client_secret',
    };

    let mockAttemptModel: any;
    let mockInstallationModel: any;
    let mockConnectionModel: any;
    let mockFetch: any;

    beforeEach(() => {
        mockAttemptModel = {
            create: mock(async (doc: any) => ({ ...doc, _id: 'attempt-123' })),
            findOne: mock(async () => null),
            findOneAndUpdate: mock(async () => null),
            updateOne: mock(async () => ({ modifiedCount: 1 })),
        };
        mockInstallationModel = {
            findOneAndUpdate: mock(async () => ({})),
        };
        mockConnectionModel = {
            findOneAndUpdate: mock(async () => ({})),
        };
        mockFetch = mock(async () => new Response(JSON.stringify({}), { status: 200 }));
    });

    const createMockReqRes = (query: Record<string, any> = {}) => {
        const req = {
            query,
        } as unknown as Request;

        const res = {
            statusCode: 200,
            headers: {} as Record<string, string>,
            body: '' as any,
            redirectUrl: '' as string,
            status(code: number) {
                this.statusCode = code;
                return this;
            },
            send(content: any) {
                this.body = content;
                return this;
            },
            json(content: any) {
                this.body = content;
                return this;
            },
            redirect(urlOrStatus: number | string, url?: string) {
                if (typeof urlOrStatus === 'number') {
                    this.statusCode = urlOrStatus;
                    this.redirectUrl = url || '';
                } else {
                    this.statusCode = 302;
                    this.redirectUrl = urlOrStatus;
                }
                return this;
            },
        } as unknown as Response & { statusCode: number; body: any; redirectUrl: string };

        return { req, res };
    };

    describe('createConnectUrl', () => {
        it('should generate secure connect URL with opaque 256-bit nonce and 10m TTL', async () => {
            const controller = createOnboardingController({
                appConfig,
                attemptModel: mockAttemptModel,
                installationModel: mockInstallationModel,
                connectionModel: mockConnectionModel,
            });

            const url = await controller.createConnectUrl('guild-123', 'user-456');

            expect(url).toContain('https://github.com/apps/octobot/installations/new?state=');
            expect(mockAttemptModel.create).toHaveBeenCalledTimes(1);

            const createdAttempt = mockAttemptModel.create.mock.calls[0][0];
            expect(createdAttempt.guildId).toBe('guild-123');
            expect(createdAttempt.initiatedByDiscordUserId).toBe('user-456');
            expect(createdAttempt.status).toBe('pending_setup');
            expect(createdAttempt.installStateHash).toBeDefined();
            expect(createdAttempt.installStateHash.length).toBe(64); // SHA-256 hex length

            const tenMinutesFromNow = Date.now() + 10 * 60 * 1000;
            const expiryTime = new Date(createdAttempt.expiresAt).getTime();
            expect(Math.abs(expiryTime - tenMinutesFromNow)).toBeLessThan(5000);

            const stateNonce = new URL(url).searchParams.get('state');
            expect(stateNonce).toBeTruthy();
            const expectedHash = crypto.createHash('sha256').update(stateNonce!).digest('hex');
            expect(expectedHash).toBe(createdAttempt.installStateHash);
        });

        it('should support custom app slug in connect URL', async () => {
            const controller = createOnboardingController({
                appConfig,
                attemptModel: mockAttemptModel,
                installationModel: mockInstallationModel,
                connectionModel: mockConnectionModel,
                appSlug: 'custom-app',
            });

            const url = await controller.createConnectUrl('guild-123', 'user-456', 'override-slug');
            expect(url).toContain('https://github.com/apps/override-slug/installations/new?state=');
        });
    });

    describe('handleSetup', () => {
        it('should return 400 if installation_id or state is missing or invalid', async () => {
            const controller = createOnboardingController({
                appConfig,
                attemptModel: mockAttemptModel,
                installationModel: mockInstallationModel,
                connectionModel: mockConnectionModel,
            });

            // Missing installation_id
            const { req: req1, res: res1 } = createMockReqRes({ state: 'some-nonce' });
            await controller.handleSetup(req1, res1);
            expect(res1.statusCode).toBe(400);
            expect(res1.body).toContain('Invalid setup parameters');

            // Non-numeric installation_id
            const { req: req2, res: res2 } = createMockReqRes({ installation_id: 'abc', state: 'some-nonce' });
            await controller.handleSetup(req2, res2);
            expect(res2.statusCode).toBe(400);
            expect(res2.body).toContain('Invalid setup parameters');

            // Missing state
            const { req: req3, res: res3 } = createMockReqRes({ installation_id: '12345' });
            await controller.handleSetup(req3, res3);
            expect(res3.statusCode).toBe(400);
            expect(res3.body).toContain('Invalid setup parameters');
        });

        it('should return 400 if connection attempt is expired or not found', async () => {
            mockAttemptModel.findOne = mock(async () => null);

            const controller = createOnboardingController({
                appConfig,
                attemptModel: mockAttemptModel,
                installationModel: mockInstallationModel,
                connectionModel: mockConnectionModel,
            });

            const { req, res } = createMockReqRes({ installation_id: '999', state: 'unknown-nonce' });
            await controller.handleSetup(req, res);

            expect(res.statusCode).toBe(400);
            expect(res.body).toContain('Connection request expired or already consumed');
        });

        it('should generate PKCE challenge, update attempt, and redirect to GitHub OAuth', async () => {
            const savedAttempt: any = {
                _id: 'attempt-1',
                installStateHash: 'somehash',
                guildId: 'guild-1',
                initiatedByDiscordUserId: 'user-1',
                status: 'pending_setup',
            };
            mockAttemptModel.findOneAndUpdate = mock(async (filter: any, update: any) => {
                if (filter.status === 'pending_setup') {
                    Object.assign(savedAttempt, update.$set);
                    return savedAttempt;
                }
                return null;
            });

            const controller = createOnboardingController({
                appConfig,
                attemptModel: mockAttemptModel,
                installationModel: mockInstallationModel,
                connectionModel: mockConnectionModel,
            });

            const { req, res } = createMockReqRes({ installation_id: '1001', state: 'valid-nonce' });
            await controller.handleSetup(req, res);

            expect(res.statusCode).toBe(302);
            expect(res.redirectUrl).toContain('https://github.com/login/oauth/authorize?');

            const redirectUrl = new URL(res.redirectUrl);
            expect(redirectUrl.searchParams.get('client_id')).toBe('Iv1.test_client_id');
            expect(redirectUrl.searchParams.get('code_challenge_method')).toBe('S256');
            expect(redirectUrl.searchParams.get('scope')).toBe('read:user');

            const oauthNonce = redirectUrl.searchParams.get('state');
            const codeChallenge = redirectUrl.searchParams.get('code_challenge');
            expect(oauthNonce).toBeTruthy();
            expect(codeChallenge).toBeTruthy();

            expect(savedAttempt.status).toBe('pending_oauth');
            expect(savedAttempt.candidateInstallationId).toBe(1001);
            expect(savedAttempt.oauthCodeVerifier).toBeDefined();

            // Verify PKCE relationship: SHA256(verifier).base64url === code_challenge
            const computedChallenge = crypto
                .createHash('sha256')
                .update(savedAttempt.oauthCodeVerifier)
                .digest('base64url');
            expect(computedChallenge).toBe(codeChallenge);

            // Verify oauthStateHash === SHA256(oauthNonce)
            const computedOAuthStateHash = crypto.createHash('sha256').update(oauthNonce!).digest('hex');
            expect(savedAttempt.oauthStateHash).toBe(computedOAuthStateHash);
        });

        it('should atomically allow only one of multiple concurrent setup requests with the same state', async () => {
            let claimCount = 0;
            mockAttemptModel.findOneAndUpdate = mock(async (filter: any, update: any) => {
                if (filter.status === 'pending_setup' && claimCount === 0) {
                    claimCount++;
                    return {
                        _id: 'attempt-concurrent',
                        status: 'pending_oauth',
                        ...update.$set,
                    };
                }
                return null;
            });

            const controller = createOnboardingController({
                appConfig,
                attemptModel: mockAttemptModel,
                installationModel: mockInstallationModel,
                connectionModel: mockConnectionModel,
            });

            const { req: req1, res: res1 } = createMockReqRes({ installation_id: '1001', state: 'same-nonce' });
            const { req: req2, res: res2 } = createMockReqRes({ installation_id: '1001', state: 'same-nonce' });

            await Promise.all([controller.handleSetup(req1, res1), controller.handleSetup(req2, res2)]);

            const statusCodes = [res1.statusCode, res2.statusCode].sort();
            expect(statusCodes).toEqual([302, 400]);
        });
    });

    describe('handleCallback', () => {
        it('should return 400 if code or state is missing', async () => {
            const controller = createOnboardingController({
                appConfig,
                attemptModel: mockAttemptModel,
                installationModel: mockInstallationModel,
                connectionModel: mockConnectionModel,
            });

            const { req: req1, res: res1 } = createMockReqRes({ code: 'abc' });
            await controller.handleCallback(req1, res1);
            expect(res1.statusCode).toBe(400);
            expect(res1.body).toContain('Invalid callback parameters');

            const { req: req2, res: res2 } = createMockReqRes({ state: 'xyz' });
            await controller.handleCallback(req2, res2);
            expect(res2.statusCode).toBe(400);
            expect(res2.body).toContain('Invalid callback parameters');
        });

        it('should atomically claim attempt (pending_oauth -> verifying) and reject replay/concurrent attempts', async () => {
            mockAttemptModel.findOneAndUpdate = mock(async () => null);

            const controller = createOnboardingController({
                appConfig,
                attemptModel: mockAttemptModel,
                installationModel: mockInstallationModel,
                connectionModel: mockConnectionModel,
            });

            const { req, res } = createMockReqRes({ code: 'auth-code', state: 'oauth-state' });
            await controller.handleCallback(req, res);

            expect(res.statusCode).toBe(400);
            expect(res.body).toContain('Invalid or expired authorization session');
            expect(mockAttemptModel.findOneAndUpdate).toHaveBeenCalledTimes(1);

            const query = mockAttemptModel.findOneAndUpdate.mock.calls[0][0];
            expect(query.status).toBe('pending_oauth');
            expect(query.expiresAt.$gt).toBeDefined();

            const update = mockAttemptModel.findOneAndUpdate.mock.calls[0][1];
            expect(update.status).toBe('verifying');
        });

        it('should handle OAuth token exchange failure and mark attempt failed', async () => {
            const claimedAttempt: any = {
                _id: 'attempt-1',
                guildId: 'guild-1',
                initiatedByDiscordUserId: 'user-1',
                candidateInstallationId: 1001,
                oauthCodeVerifier: 'test-verifier',
                status: 'verifying',
                save: mock(async function (this: any) {
                    return this;
                }),
            };
            mockAttemptModel.findOneAndUpdate = mock(async () => claimedAttempt);

            mockFetch = mock(
                async () =>
                    new Response(
                        JSON.stringify({ error: 'bad_verification_code', error_description: 'Code invalid' }),
                        {
                            status: 400,
                        }
                    )
            );

            const controller = createOnboardingController({
                appConfig,
                attemptModel: mockAttemptModel,
                installationModel: mockInstallationModel,
                connectionModel: mockConnectionModel,
                fetchFn: mockFetch,
            });

            const { req, res } = createMockReqRes({ code: 'bad-code', state: 'valid-state' });
            await controller.handleCallback(req, res);

            expect(res.statusCode).toBe(400);
            expect(mockAttemptModel.updateOne).toHaveBeenCalledWith(
                { _id: 'attempt-1' },
                { status: 'failed', oauthCodeVerifier: undefined }
            );
        });

        it('should return 403 and mark attempt failed if candidate installation is not in user installations', async () => {
            const claimedAttempt: any = {
                _id: 'attempt-1',
                guildId: 'guild-1',
                initiatedByDiscordUserId: 'user-1',
                candidateInstallationId: 1001,
                oauthCodeVerifier: 'test-verifier',
                status: 'verifying',
                save: mock(async function (this: any) {
                    return this;
                }),
            };
            mockAttemptModel.findOneAndUpdate = mock(async () => claimedAttempt);

            mockFetch = mock(async (url: string) => {
                if (url.includes('/login/oauth/access_token')) {
                    return new Response(JSON.stringify({ access_token: 'gho_temporary_token', token_type: 'bearer' }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    });
                }
                if (url.includes('/user/installations')) {
                    return new Response(
                        JSON.stringify({
                            total_count: 1,
                            installations: [
                                {
                                    id: 9999, // Different installation ID
                                    account: { id: 2, login: 'other-org', type: 'Organization' },
                                },
                            ],
                        }),
                        { status: 200, headers: { 'Content-Type': 'application/json' } }
                    );
                }
                return new Response('Not found', { status: 404 });
            });

            const controller = createOnboardingController({
                appConfig,
                attemptModel: mockAttemptModel,
                installationModel: mockInstallationModel,
                connectionModel: mockConnectionModel,
                fetchFn: mockFetch,
            });

            const { req, res } = createMockReqRes({ code: 'valid-code', state: 'valid-state' });
            await controller.handleCallback(req, res);

            expect(res.statusCode).toBe(403);
            expect(res.body).toContain('Installation verification failed');
            expect(mockAttemptModel.updateOne).toHaveBeenCalledWith(
                { _id: 'attempt-1' },
                { status: 'failed', oauthCodeVerifier: undefined }
            );
            expect(mockConnectionModel.findOneAndUpdate).not.toHaveBeenCalled();
            expect(mockInstallationModel.findOneAndUpdate).not.toHaveBeenCalled();
        });

        it('should complete happy path: exchange token, verify installation, upsert models, clear verifier, and return 200 HTML', async () => {
            const claimedAttempt: any = {
                _id: 'attempt-1',
                guildId: 'guild-1',
                initiatedByDiscordUserId: 'user-1',
                candidateInstallationId: 1001,
                oauthCodeVerifier: 'test-verifier',
                status: 'verifying',
                save: mock(async function (this: any) {
                    return this;
                }),
            };
            mockAttemptModel.findOneAndUpdate = mock(async () => claimedAttempt);

            mockFetch = mock(async (url: string, init?: RequestInit) => {
                if (url.includes('/login/oauth/access_token')) {
                    const body = JSON.parse((init?.body as string) || '{}');
                    expect(body.client_id).toBe('Iv1.test_client_id');
                    expect(body.client_secret).toBe('test_client_secret');
                    expect(body.code).toBe('valid-code');
                    expect(body.code_verifier).toBe('test-verifier');

                    return new Response(JSON.stringify({ access_token: 'gho_temporary_token', token_type: 'bearer' }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    });
                }
                if (url.includes('/user/installations')) {
                    expect(init?.headers).toBeDefined();
                    const headers = init?.headers as Record<string, string>;
                    expect(headers.Authorization).toBe('Bearer gho_temporary_token');

                    return new Response(
                        JSON.stringify({
                            total_count: 1,
                            installations: [
                                {
                                    id: 1001,
                                    account: { id: 50, login: 'My-Org', type: 'Organization' },
                                    repository_selection: 'all',
                                    permissions: { issues: 'write', metadata: 'read' },
                                    events: ['push', 'issues'],
                                },
                            ],
                        }),
                        { status: 200, headers: { 'Content-Type': 'application/json' } }
                    );
                }
                return new Response('Not found', { status: 404 });
            });

            const controller = createOnboardingController({
                appConfig,
                attemptModel: mockAttemptModel,
                installationModel: mockInstallationModel,
                connectionModel: mockConnectionModel,
                fetchFn: mockFetch,
            });

            const { req, res } = createMockReqRes({ code: 'valid-code', state: 'valid-state' });
            await controller.handleCallback(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.body).toContain('OctoBot Connected!');
            expect(res.body).toContain('/gh repo watch');

            // Verify GitHubInstallation upsert
            expect(mockInstallationModel.findOneAndUpdate).toHaveBeenCalledWith(
                { installationId: 1001 },
                {
                    installationId: 1001,
                    accountId: 50,
                    accountLogin: 'my-org',
                    accountType: 'Organization',
                    status: 'active',
                    repositorySelection: 'all',
                    permissions: { issues: 'write', metadata: 'read' },
                    events: ['push', 'issues'],
                },
                { upsert: true, new: true }
            );

            // Verify DiscordGuildConnection upsert
            expect(mockConnectionModel.findOneAndUpdate).toHaveBeenCalledWith(
                { guildId: 'guild-1', installationId: 1001 },
                {
                    guildId: 'guild-1',
                    installationId: 1001,
                    status: 'connected',
                    connectedByDiscordUserId: 'user-1',
                },
                { upsert: true, new: true }
            );

            // Verify attempt finalization
            expect(claimedAttempt.status).toBe('consumed');
            expect(claimedAttempt.oauthCodeVerifier).toBeUndefined();
            expect(claimedAttempt.save).toHaveBeenCalledTimes(1);
        });

        it('should paginate /user/installations and succeed when candidate installation is on page 2', async () => {
            const claimedAttempt: any = {
                _id: 'attempt-p2',
                guildId: 'guild-p2',
                initiatedByDiscordUserId: 'user-p2',
                candidateInstallationId: 2002,
                oauthCodeVerifier: 'test-verifier-p2',
                status: 'verifying',
                save: mock(async function (this: any) {
                    return this;
                }),
            };
            mockAttemptModel.findOneAndUpdate = mock(async () => claimedAttempt);

            mockFetch = mock(async (url: string) => {
                if (url.includes('/login/oauth/access_token')) {
                    return new Response(JSON.stringify({ access_token: 'gho_p2_token', token_type: 'bearer' }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    });
                }
                if (url.includes('/user/installations')) {
                    if (url.includes('&page=1')) {
                        const page1Installations = Array.from({ length: 100 }, (_, i) => ({
                            id: 1000 + i,
                            account: { id: i + 1, login: `Org-${i + 1}`, type: 'Organization' },
                        }));
                        return new Response(
                            JSON.stringify({
                                total_count: 101,
                                installations: page1Installations,
                            }),
                            { status: 200, headers: { 'Content-Type': 'application/json' } }
                        );
                    }
                    if (url.includes('&page=2')) {
                        return new Response(
                            JSON.stringify({
                                total_count: 101,
                                installations: [
                                    {
                                        id: 2002,
                                        account: { id: 999, login: 'Target-Org', type: 'Organization' },
                                    },
                                ],
                            }),
                            { status: 200, headers: { 'Content-Type': 'application/json' } }
                        );
                    }
                }
                return new Response('Not found', { status: 404 });
            });

            const controller = createOnboardingController({
                appConfig,
                attemptModel: mockAttemptModel,
                installationModel: mockInstallationModel,
                connectionModel: mockConnectionModel,
                fetchFn: mockFetch,
            });

            const { req, res } = createMockReqRes({ code: 'valid-code-p2', state: 'valid-state-p2' });
            await controller.handleCallback(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.body).toContain('OctoBot Connected!');
            expect(mockConnectionModel.findOneAndUpdate).toHaveBeenCalledWith(
                { guildId: 'guild-p2', installationId: 2002 },
                expect.anything(),
                expect.anything()
            );
        });

        it('should return 403 and mark attempt failed if /user/installations API call throws an error', async () => {
            const claimedAttempt: any = {
                _id: 'attempt-1',
                guildId: 'guild-1',
                initiatedByDiscordUserId: 'user-1',
                candidateInstallationId: 1001,
                oauthCodeVerifier: 'test-verifier',
                status: 'verifying',
                save: mock(async function (this: any) {
                    return this;
                }),
            };
            mockAttemptModel.findOneAndUpdate = mock(async () => claimedAttempt);

            mockFetch = mock(async (url: string) => {
                if (url.includes('/login/oauth/access_token')) {
                    return new Response(JSON.stringify({ access_token: 'gho_temporary_token' }), { status: 200 });
                }
                if (url.includes('/user/installations')) {
                    return new Response('API rate limited or server error', { status: 500 });
                }
                return new Response('Not found', { status: 404 });
            });

            const controller = createOnboardingController({
                appConfig,
                attemptModel: mockAttemptModel,
                installationModel: mockInstallationModel,
                connectionModel: mockConnectionModel,
                fetchFn: mockFetch,
            });

            const { req, res } = createMockReqRes({ code: 'valid-code', state: 'valid-state' });
            await controller.handleCallback(req, res);

            expect(res.statusCode).toBe(403);
            expect(res.body).toContain('Installation verification failed');
            expect(mockAttemptModel.updateOne).toHaveBeenCalledWith(
                { _id: 'attempt-1' },
                { status: 'failed', oauthCodeVerifier: undefined }
            );
        });
    });

    describe('HTML escaping and security', () => {
        it('should escape malicious HTML in error messages', async () => {
            const claimedAttempt: any = {
                _id: 'attempt-1',
                candidateInstallationId: 1001,
                oauthCodeVerifier: 'verifier',
                status: 'verifying',
            };
            mockAttemptModel.findOneAndUpdate = mock(async () => claimedAttempt);

            mockFetch = mock(
                async () =>
                    new Response(
                        JSON.stringify({
                            error: 'xss',
                            error_description: '<script>alert("xss")</script>',
                        }),
                        { status: 400 }
                    )
            );

            const controller = createOnboardingController({
                appConfig,
                attemptModel: mockAttemptModel,
                installationModel: mockInstallationModel,
                connectionModel: mockConnectionModel,
                fetchFn: mockFetch,
            });

            const { req, res } = createMockReqRes({ code: 'code', state: 'state' });
            await controller.handleCallback(req, res);

            expect(res.statusCode).toBe(400);
            expect(res.body).not.toContain('<script>alert("xss")</script>');
            expect(res.body).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
        });
    });

    describe('Routes Mounting and Express Integration', () => {
        it('should route GET /setup and GET /callback via createGitHubOnboardingRouter', async () => {
            const { createGitHubOnboardingRouter } = await import('../../src/routes/githubOnboardingRoutes');
            const mockController: any = {
                handleSetup: mock(async (_req: Request, res: Response) => {
                    res.status(200).send('setup-ok');
                }),
                handleCallback: mock(async (_req: Request, res: Response) => {
                    res.status(200).send('callback-ok');
                }),
            };

            const router = createGitHubOnboardingRouter(mockController);
            const express = (await import('express')).default;
            const app = express();
            app.use('/api/github', router);

            const server = app.listen(0);
            const address = server.address() as any;
            const baseUrl = `http://127.0.0.1:${address.port}`;

            try {
                const setupRes = await fetch(`${baseUrl}/api/github/setup?installation_id=123&state=abc`);
                expect(setupRes.status).toBe(200);
                const setupBody = await setupRes.text();
                expect(setupBody).toBe('setup-ok');
                expect(mockController.handleSetup).toHaveBeenCalledTimes(1);

                const callbackRes = await fetch(`${baseUrl}/api/github/callback?code=xyz&state=abc`);
                expect(callbackRes.status).toBe(200);
                const callbackBody = await callbackRes.text();
                expect(callbackBody).toBe('callback-ok');
                expect(mockController.handleCallback).toHaveBeenCalledTimes(1);
            } finally {
                server.close();
            }
        });
    });
});
