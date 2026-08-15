import { describe, expect, it } from 'bun:test';
import crypto from 'crypto';
import { verifyGithubWebhook } from '../../src/middlewares/verifyGithubWebhook';

describe('Middleware - verifyGithubWebhook', () => {
    const secret = 'test-webhook-secret';
    process.env.GITHUB_WEBHOOK_SECRET = secret;

    it('debe rechazar solicitudes sin cabecera de evento', () => {
        let status = 0;
        let responseJson: any = null;

        const req: any = { headers: {} };
        const res: any = {
            status: (s: number) => {
                status = s;
                return {
                    json: (j: any) => {
                        responseJson = j;
                    },
                };
            },
        };

        verifyGithubWebhook(req, res, () => {});
        expect(status).toBe(400);
        expect(responseJson.error).toContain('No GitHub event specified');
    });

    it('debe aceptar eventos de ping sin firma', () => {
        let status = 0;
        let responseJson: any = null;

        const req: any = { headers: { 'x-github-event': 'ping' } };
        const res: any = {
            status: (s: number) => {
                status = s;
                return {
                    json: (j: any) => {
                        responseJson = j;
                    },
                };
            },
        };

        verifyGithubWebhook(req, res, () => {});
        expect(status).toBe(200);
        expect(responseJson.message).toBe('Webhook ping received');
    });

    it('debe rechazar solicitudes sin cabecera de firma', () => {
        let status = 0;
        let responseJson: any = null;

        const req: any = {
            headers: { 'x-github-event': 'push' },
        };
        const res: any = {
            status: (s: number) => {
                status = s;
                return {
                    json: (j: any) => {
                        responseJson = j;
                    },
                };
            },
        };

        verifyGithubWebhook(req, res, () => {});
        expect(status).toBe(401);
        expect(responseJson.error).toContain('Missing signature header');
    });

    it('debe rechazar firmas HMAC no válidas', () => {
        let status = 0;
        let responseJson: any = null;

        const payload = JSON.stringify({ action: 'opened' });
        const invalidSignature = 'sha256=1111222233334444555566667777888899990000111122223333444455556666';

        const req: any = {
            headers: {
                'x-github-event': 'issues',
                'x-hub-signature-256': invalidSignature,
            },
            rawBody: Buffer.from(payload),
            body: JSON.parse(payload),
        };
        const res: any = {
            status: (s: number) => {
                status = s;
                return {
                    json: (j: any) => {
                        responseJson = j;
                    },
                };
            },
        };

        verifyGithubWebhook(req, res, () => {});
        expect(status).toBe(401);
        expect(responseJson.error).toContain('Invalid webhook signature');
    });

    it('debe permitir el paso cuando la firma HMAC es correcta', (done) => {
        const payload = JSON.stringify({ action: 'opened', repository: { full_name: 'user/repo' } });
        const hmac = crypto.createHmac('sha256', secret).update(Buffer.from(payload)).digest('hex');

        const req: any = {
            headers: {
                'x-github-event': 'issues',
                'x-hub-signature-256': `sha256=${hmac}`,
            },
            rawBody: Buffer.from(payload),
            body: JSON.parse(payload),
        };
        const res: any = {};

        verifyGithubWebhook(req, res, () => {
            done();
        });
    });
});
