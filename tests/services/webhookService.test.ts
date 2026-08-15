import { describe, expect, it } from 'bun:test';
import { webhookService } from '../../src/services/github/webhookService';
import { WEBHOOK_EVENTS } from '../../src/types/webhook';

describe('WebhookService Configuration', () => {
    it('debe construir la URL de webhook apuntando a /api/webhooks/github', () => {
        const apiUrl = 'https://octobot.example.com';
        const expectedUrl = 'https://octobot.example.com/api/webhooks/github';

        const config = (webhookService as any).getWebhookConfig(apiUrl);

        expect(config.url).toBe(expectedUrl);
        expect(config.content_type).toBe('json');
    });

    it('debe incluir todos los eventos requeridos de WEBHOOK_EVENTS', () => {
        const mockConfig = {
            url: 'https://octobot.example.com/api/webhooks/github',
            content_type: 'json' as const,
            secret: 'test-secret',
            insecure_ssl: '0',
        };

        const options = (webhookService as any).getWebhookOptions(mockConfig);

        expect(options.active).toBe(true);
        expect(options.events).toEqual([...WEBHOOK_EVENTS]);
        expect(options.events).toContain('push');
        expect(options.events).toContain('pull_request');
        expect(options.events).toContain('issues');
    });
});
