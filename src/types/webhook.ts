/**
 * Events currently supported and processed by OctoBot V1.
 */
export const SUPPORTED_WEBHOOK_EVENTS = ['push', 'pull_request', 'issues', 'release', 'create', 'delete'] as const;

export type SupportedWebhookEvent = (typeof SUPPORTED_WEBHOOK_EVENTS)[number];
export type SubscriptionEvent = SupportedWebhookEvent;

export const WEBHOOK_EVENTS = SUPPORTED_WEBHOOK_EVENTS;
export type WebhookEventType = SupportedWebhookEvent;

export interface WebhookConfig {
    url: string;
    content_type: 'json';
    secret: string;
    insecure_ssl: string;
}

export interface WebhookOptions {
    events: SupportedWebhookEvent[];
    config: WebhookConfig;
    active: boolean;
}
