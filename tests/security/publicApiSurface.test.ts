import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { Server } from 'node:http';
import { createApp } from '../../src/app';
import { repositoryService } from '../../src/services/github/repositoryService';

describe('Public API security surface', () => {
    let server: Server;
    let baseUrl: string;
    let previousWebhookSecret: string | undefined;

    beforeAll(async () => {
        previousWebhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
        process.env.GITHUB_WEBHOOK_SECRET = 'test-webhook-secret';

        const app = createApp({
            client: { isReady: () => true },
            webhookConnected: true,
        });

        await new Promise<void>((resolve) => {
            server = app.listen(0, '127.0.0.1', resolve);
        });

        const address = server.address();
        if (!address || typeof address === 'string') {
            throw new Error('Unable to resolve ephemeral test server address');
        }

        baseUrl = `http://127.0.0.1:${address.port}`;
    });

    afterAll(async () => {
        if (previousWebhookSecret === undefined) {
            delete process.env.GITHUB_WEBHOOK_SECRET;
        } else {
            process.env.GITHUB_WEBHOOK_SECRET = previousWebhookSecret;
        }

        await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        });
    });

    it('does not expose repository administration or repository data over HTTP', async () => {
        const requests: Array<[string, RequestInit | undefined]> = [
            ['/api/repositories', { method: 'POST' }],
            ['/api/repositories/example', { method: 'PATCH' }],
            ['/api/repositories/example', { method: 'DELETE' }],
            ['/api/repositories/example/visibility', { method: 'PATCH' }],
            ['/api/repositories/example/topics', { method: 'PATCH' }],
            ['/api/repositories/github', undefined],
            ['/api/repositories/stored', undefined],
            ['/api/repositories/example/stats', undefined],
        ];

        for (const [path, init] of requests) {
            const response = await fetch(`${baseUrl}${path}`, init);
            expect(response.status).toBe(404);
        }
    });

    it('does not expose webhook simulation or HTTP webhook administration', async () => {
        const testResponse = await fetch(`${baseUrl}/api/webhooks/github/test`, { method: 'POST' });
        const adminResponse = await fetch(`${baseUrl}/api/webhooks/github/repository/example`, { method: 'POST' });

        expect(testResponse.status).toBe(404);
        expect(adminResponse.status).toBe(404);
    });

    it('keeps the GitHub webhook receiver mounted behind signature verification', async () => {
        const response = await fetch(`${baseUrl}/api/webhooks/github`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-github-event': 'push',
            },
            body: JSON.stringify({ repository: { name: 'octobot', full_name: 'sandovaldavid/octobot' } }),
        });

        expect(response.status).toBe(401);
    });

    it('keeps the health endpoint available without exposing credentials', async () => {
        const response = await fetch(`${baseUrl}/health`);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.status).toBe('OK');
        expect(body.discord).toBe('Connected');
        expect(body.webhook).toBe('Configured');
        expect(JSON.stringify(body)).not.toContain('GITHUB_TOKEN');
        expect(JSON.stringify(body)).not.toContain('GITHUB_WEBHOOK_SECRET');
    });

    it('does not retain generic GitHub repository mutation capabilities in repositoryService', () => {
        expect('createRepository' in repositoryService).toBe(false);
        expect('updateRepository' in repositoryService).toBe(false);
        expect('deleteRepository' in repositoryService).toBe(false);
        expect('configureWebhook' in repositoryService).toBe(false);
    });
});
