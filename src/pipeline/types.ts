export interface VerifiedGithubDelivery {
    deliveryId: string;
    eventName: string;
    receivedAt: Date;
    payload: unknown;
}

export type ProcessingOutcome =
    | 'delivered'
    | 'ignored_ping'
    | 'ignored_unsupported_event'
    | 'ignored_no_subscription'
    | 'ignored_subscription_filter'
    | 'ignored_policy'
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

export type PullRequestAction =
    | 'opened'
    | 'closed'
    | 'reopened'
    | 'synchronize'
    | 'merged'
    | 'ready_for_review'
    | 'review_requested';

export type PullRequestReviewAction = 'submitted' | 'edited' | 'dismissed';

export type ReviewState = 'approved' | 'changes_requested' | 'commented' | 'dismissed';

export type IssueAction = 'opened' | 'closed' | 'reopened' | 'labeled' | 'unlabeled' | 'assigned' | 'unassigned';

export type ReleaseAction = 'published' | 'created' | 'edited' | 'deleted' | 'prereleased';

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
    action: PullRequestAction;
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
    draft: boolean;
    changedFiles?: number;
    requestedReviewers: string[];
    mergedBy?: string;
}

export interface NormalizedPullRequestReviewEvent {
    type: 'pull_request_review';
    repositoryFullName: string;
    action: PullRequestReviewAction;
    reviewState: ReviewState;
    prNumber: number;
    prTitle: string;
    prHtmlUrl: string;
    prHeadRef: string;
    prBaseRef: string;
    reviewerLogin: string;
    reviewerAvatar: string;
    body?: string;
    htmlUrl: string;
    submittedAt?: string;
}

export interface NormalizedIssueEvent {
    type: 'issues';
    repositoryFullName: string;
    action: IssueAction;
    issueNumber: number;
    title: string;
    body: string;
    htmlUrl: string;
    userLogin: string;
    userAvatar: string;
    state: 'open' | 'closed';
    labels: string[];
    assigneeLogin?: string;
}

export interface NormalizedReleaseEvent {
    type: 'release';
    repositoryFullName: string;
    action: ReleaseAction;
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
    | NormalizedPullRequestReviewEvent
    | NormalizedIssueEvent
    | NormalizedReleaseEvent
    | NormalizedBranchCreatedEvent
    | NormalizedBranchDeletedEvent
    | NormalizedPingEvent
    | NormalizedUnsupportedEvent;

export type NormalizationResult =
    | { success: true; event: NormalizedGithubEvent }
    | { success: false; reason: string; repositoryFullName?: string };
