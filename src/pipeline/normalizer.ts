import {
    VerifiedGithubDelivery,
    NormalizationResult,
    NormalizedPushEvent,
    NormalizedPullRequestEvent,
    NormalizedIssueEvent,
    NormalizedReleaseEvent,
    NormalizedBranchCreatedEvent,
    NormalizedBranchDeletedEvent,
    NormalizedPingEvent,
    NormalizedUnsupportedEvent,
    PullRequestAction,
    IssueAction,
    ReleaseAction,
} from './types';

const VALID_PR_ACTIONS: PullRequestAction[] = [
    'opened',
    'closed',
    'reopened',
    'synchronize',
    'ready_for_review',
    'review_requested',
];

const VALID_ISSUE_ACTIONS: IssueAction[] = [
    'opened',
    'closed',
    'reopened',
    'labeled',
    'unlabeled',
    'assigned',
    'unassigned',
];

const VALID_RELEASE_ACTIONS: ReleaseAction[] = ['published', 'created', 'edited', 'deleted', 'prereleased'];

export function normalizeGithubEvent(delivery: VerifiedGithubDelivery): NormalizationResult {
    const { eventName, payload } = delivery;

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return {
            success: false,
            reason: 'Payload must be a non-null JSON object',
        };
    }

    const p = payload as Record<string, any>;

    if (eventName === 'ping') {
        const repoFullName =
            typeof p.repository?.full_name === 'string' ? p.repository.full_name.toLowerCase() : undefined;

        return {
            success: true,
            event: {
                type: 'ping',
                zen: typeof p.zen === 'string' ? p.zen : undefined,
                hookId: typeof p.hook_id === 'number' ? p.hook_id : undefined,
                repositoryFullName: repoFullName,
            } as NormalizedPingEvent,
        };
    }

    // For any repository-targeted event, require valid canonical owner/repo
    const rawRepoFullName = p.repository?.full_name;
    if (typeof rawRepoFullName !== 'string' || !rawRepoFullName.includes('/') || rawRepoFullName.trim().length === 0) {
        return {
            success: false,
            reason: 'Missing or invalid repository.full_name (expected "owner/repo" format)',
        };
    }

    const repoFullName = rawRepoFullName.toLowerCase().trim();

    switch (eventName) {
        case 'push': {
            if (typeof p.ref !== 'string' || p.ref.trim().length === 0) {
                return {
                    success: false,
                    reason: 'Missing or invalid ref for push event',
                    repositoryFullName: repoFullName,
                };
            }

            const commits = Array.isArray(p.commits)
                ? p.commits.map((c: any) => ({
                      id: String(c.id || ''),
                      message: String(c.message || ''),
                      authorName: String(c.author?.name || c.committer?.name || 'Unknown'),
                  }))
                : [];

            return {
                success: true,
                event: {
                    type: 'push',
                    repositoryFullName: repoFullName,
                    ref: p.ref,
                    compareUrl: String(p.compare || p.repository?.html_url || ''),
                    pusherName: String(p.pusher?.name || p.sender?.login || 'GitHub'),
                    senderAvatar: String(p.sender?.avatar_url || ''),
                    commits,
                } as NormalizedPushEvent,
            };
        }

        case 'pull_request': {
            const pr = p.pull_request;
            if (!pr || typeof pr !== 'object') {
                return {
                    success: false,
                    reason: 'Missing pull_request object in pull_request event',
                    repositoryFullName: repoFullName,
                };
            }

            const rawAction = String(p.action || '');
            const prNumber = Number(pr.number || p.number);
            const title = typeof pr.title === 'string' ? pr.title.trim() : '';
            const headRef = typeof pr.head?.ref === 'string' ? pr.head.ref.trim() : '';
            const baseRef = typeof pr.base?.ref === 'string' ? pr.base.ref.trim() : '';

            if (!prNumber || prNumber <= 0) {
                return {
                    success: false,
                    reason: 'Missing or invalid pull_request.number',
                    repositoryFullName: repoFullName,
                };
            }

            if (!title) {
                return {
                    success: false,
                    reason: 'Missing or invalid pull_request.title',
                    repositoryFullName: repoFullName,
                };
            }

            if (!headRef || !baseRef) {
                return {
                    success: false,
                    reason: 'Missing pull_request head or base branch references',
                    repositoryFullName: repoFullName,
                };
            }

            const isMerged = rawAction === 'closed' && Boolean(pr.merged);
            let action: PullRequestAction;

            if (isMerged) {
                action = 'merged';
            } else if (VALID_PR_ACTIONS.includes(rawAction as PullRequestAction)) {
                action = rawAction as PullRequestAction;
            } else {
                return {
                    success: false,
                    reason: `Unsupported pull_request action: "${rawAction}"`,
                    repositoryFullName: repoFullName,
                };
            }

            return {
                success: true,
                event: {
                    type: 'pull_request',
                    repositoryFullName: repoFullName,
                    action,
                    prNumber,
                    title,
                    body: String(pr.body || ''),
                    htmlUrl: String(pr.html_url || ''),
                    userLogin: String(pr.user?.login || p.sender?.login || 'ghost'),
                    userAvatar: String(pr.user?.avatar_url || p.sender?.avatar_url || ''),
                    headRef,
                    baseRef,
                    additions: Number(pr.additions || 0),
                    deletions: Number(pr.deletions || 0),
                    merged: Boolean(pr.merged),
                } as NormalizedPullRequestEvent,
            };
        }

        case 'issues': {
            const issue = p.issue;
            if (!issue || typeof issue !== 'object') {
                return {
                    success: false,
                    reason: 'Missing issue object in issues event',
                    repositoryFullName: repoFullName,
                };
            }

            const rawAction = String(p.action || '');
            const issueNumber = Number(issue.number || p.number);
            const title = typeof issue.title === 'string' ? issue.title.trim() : '';

            if (!issueNumber || issueNumber <= 0) {
                return {
                    success: false,
                    reason: 'Missing or invalid issue.number',
                    repositoryFullName: repoFullName,
                };
            }

            if (!title) {
                return {
                    success: false,
                    reason: 'Missing or invalid issue.title',
                    repositoryFullName: repoFullName,
                };
            }

            if (!VALID_ISSUE_ACTIONS.includes(rawAction as IssueAction)) {
                return {
                    success: false,
                    reason: `Unsupported issue action: "${rawAction}"`,
                    repositoryFullName: repoFullName,
                };
            }

            const labels = Array.isArray(issue.labels)
                ? issue.labels.map((l: any) => (typeof l === 'string' ? l : l.name || ''))
                : [];

            return {
                success: true,
                event: {
                    type: 'issues',
                    repositoryFullName: repoFullName,
                    action: rawAction as IssueAction,
                    issueNumber,
                    title,
                    body: String(issue.body || ''),
                    htmlUrl: String(issue.html_url || ''),
                    userLogin: String(issue.user?.login || p.sender?.login || 'ghost'),
                    userAvatar: String(issue.user?.avatar_url || p.sender?.avatar_url || ''),
                    state: issue.state === 'closed' ? 'closed' : 'open',
                    labels,
                    assigneeLogin: issue.assignee?.login,
                } as NormalizedIssueEvent,
            };
        }

        case 'release': {
            const release = p.release;
            if (!release || typeof release !== 'object') {
                return {
                    success: false,
                    reason: 'Missing release object in release event',
                    repositoryFullName: repoFullName,
                };
            }

            const tagName = typeof release.tag_name === 'string' ? release.tag_name.trim() : '';
            if (!tagName) {
                return {
                    success: false,
                    reason: 'Missing or invalid release.tag_name',
                    repositoryFullName: repoFullName,
                };
            }

            const rawAction = String(p.action || 'published');
            const action: ReleaseAction = VALID_RELEASE_ACTIONS.includes(rawAction as ReleaseAction)
                ? (rawAction as ReleaseAction)
                : 'published';

            return {
                success: true,
                event: {
                    type: 'release',
                    repositoryFullName: repoFullName,
                    action,
                    tagName,
                    name: String(release.name || tagName),
                    htmlUrl: String(release.html_url || ''),
                    authorLogin: String(release.author?.login || p.sender?.login || 'ghost'),
                    authorAvatar: String(release.author?.avatar_url || p.sender?.avatar_url || ''),
                    isPrerelease: Boolean(release.prerelease),
                    publishedAt: String(release.published_at || new Date().toISOString()),
                } as NormalizedReleaseEvent,
            };
        }

        case 'create': {
            const ref = typeof p.ref === 'string' ? p.ref.trim() : '';
            const refType = p.ref_type === 'branch' ? 'branch' : p.ref_type === 'tag' ? 'tag' : null;

            if (!ref || !refType) {
                return {
                    success: false,
                    reason: 'Missing or invalid ref or ref_type in create event',
                    repositoryFullName: repoFullName,
                };
            }

            return {
                success: true,
                event: {
                    type: 'create',
                    repositoryFullName: repoFullName,
                    ref,
                    refType,
                    senderLogin: String(p.sender?.login || 'ghost'),
                    senderAvatar: String(p.sender?.avatar_url || ''),
                    htmlUrl: String(p.repository?.html_url || ''),
                } as NormalizedBranchCreatedEvent,
            };
        }

        case 'delete': {
            const ref = typeof p.ref === 'string' ? p.ref.trim() : '';
            const refType = p.ref_type === 'branch' ? 'branch' : p.ref_type === 'tag' ? 'tag' : null;

            if (!ref || !refType) {
                return {
                    success: false,
                    reason: 'Missing or invalid ref or ref_type in delete event',
                    repositoryFullName: repoFullName,
                };
            }

            return {
                success: true,
                event: {
                    type: 'delete',
                    repositoryFullName: repoFullName,
                    ref,
                    refType,
                    senderLogin: String(p.sender?.login || 'ghost'),
                    senderAvatar: String(p.sender?.avatar_url || ''),
                    htmlUrl: String(p.repository?.html_url || ''),
                } as NormalizedBranchDeletedEvent,
            };
        }

        default:
            return {
                success: true,
                event: {
                    type: 'unsupported',
                    rawEvent: eventName,
                    repositoryFullName: repoFullName,
                } as NormalizedUnsupportedEvent,
            };
    }
}
