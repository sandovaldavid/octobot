export interface VerifiedGithubDelivery {
    deliveryId: string;
    eventName: string;
    receivedAt: Date;
    payload: Record<string, any>;
}

export type ProcessingOutcome =
    | 'delivered'
    | 'ignored_ping'
    | 'ignored_unsupported_event'
    | 'ignored_no_subscription'
    | 'ignored_subscription_filter'
    | 'invalid_payload'
    | 'partial_delivery'
    | 'failed';

export interface ProcessingResult {
    deliveryId: string;
    eventName: string;
    repositoryFullName?: string;
    outcome: ProcessingOutcome;
    matchedSubscriptions: number;
    attempted: number;
    succeeded: number;
    failed: number;
    durationMs: number;
    error?: string;
}

export interface NormalizedPushEvent {
    type: 'push';
    repositoryFullName: string;
    ref: string;
    compareUrl: string;
    pusherName: string;
    senderAvatar: string;
    commits: Array<{
        id: string;
        message: string;
        authorName: string;
    }>;
}

export interface NormalizedPullRequestEvent {
    type: 'pull_request';
    repositoryFullName: string;
    action: 'opened' | 'closed' | 'reopened' | 'synchronize' | 'merged' | string;
    prNumber: number;
    title: string;
    body: string;
    htmlUrl: string;
    userLogin: string;
    userAvatar: string;
    headRef: string;
    baseRef: string;
    additions: number;
    deletions: number;
    merged: boolean;
}

export interface NormalizedIssueEvent {
    type: 'issues';
    repositoryFullName: string;
    action: 'opened' | 'closed' | 'reopened' | 'labeled' | string;
    issueNumber: number;
    title: string;
    body: string;
    htmlUrl: string;
    userLogin: string;
    userAvatar: string;
    state: string;
    labels: string[];
    assigneeLogin?: string;
}

export interface NormalizedReleaseEvent {
    type: 'release';
    repositoryFullName: string;
    action: string;
    tagName: string;
    name: string;
    htmlUrl: string;
    authorLogin: string;
    authorAvatar: string;
    isPrerelease: boolean;
    publishedAt: string;
}

export interface NormalizedBranchCreatedEvent {
    type: 'create';
    repositoryFullName: string;
    ref: string;
    refType: 'branch' | 'tag';
    senderLogin: string;
    senderAvatar: string;
    htmlUrl: string;
}

export interface NormalizedBranchDeletedEvent {
    type: 'delete';
    repositoryFullName: string;
    ref: string;
    refType: 'branch' | 'tag';
    senderLogin: string;
    senderAvatar: string;
    htmlUrl: string;
}

export interface NormalizedPingEvent {
    type: 'ping';
    zen?: string;
    hookId?: number;
    repositoryFullName?: string;
}

export interface NormalizedUnsupportedEvent {
    type: 'unsupported';
    rawEvent: string;
    repositoryFullName?: string;
}

export type NormalizedGithubEvent =
    | NormalizedPushEvent
    | NormalizedPullRequestEvent
    | NormalizedIssueEvent
    | NormalizedReleaseEvent
    | NormalizedBranchCreatedEvent
    | NormalizedBranchDeletedEvent
    | NormalizedPingEvent
    | NormalizedUnsupportedEvent;
