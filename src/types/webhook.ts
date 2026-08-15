/**
 * All events that OctoBot V1 can parse, normalize, and process.
 */
export const SUPPORTED_WEBHOOK_EVENTS = [
    'push',
    'pull_request',
    'pull_request_review',
    'workflow_run',
    'issues',
    'release',
    'create',
    'delete',
] as const;

/**
 * Default events enabled when a new channel subscription is created via /github repo watch.
 * Default ON: actionable PRs, reviews, CI alerts, issues, and releases.
 * Default OFF (noise reduction): raw pushes, branch creation, branch deletion.
 */
export const DEFAULT_SUBSCRIPTION_EVENTS = [
    'pull_request',
    'pull_request_review',
    'workflow_run',
    'issues',
    'release',
] as const;

export type SupportedWebhookEvent = (typeof SUPPORTED_WEBHOOK_EVENTS)[number];
export type DefaultSubscriptionEvent = (typeof DEFAULT_SUBSCRIPTION_EVENTS)[number];
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
