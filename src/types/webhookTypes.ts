export const WEBHOOK_EVENTS = [
    'push',
    'pull_request',
    'issues',
    'release',
    'create',
    'delete',
    'watch',
    'fork',
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number];

export interface WebhookConfig {
    url: string;
    content_type: 'json';
    secret: string;
    insecure_ssl: string;
}

export interface WebhookOptions {
    events: WebhookEventType[];
    config: WebhookConfig;
    active: boolean;
}
