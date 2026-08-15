import {
    VerifiedGithubDelivery,
    NormalizedGithubEvent,
    NormalizedPushEvent,
    NormalizedPullRequestEvent,
    NormalizedIssueEvent,
    NormalizedReleaseEvent,
    NormalizedBranchCreatedEvent,
    NormalizedBranchDeletedEvent,
    NormalizedPingEvent,
    NormalizedUnsupportedEvent,
} from './types';

export function normalizeGithubEvent(delivery: VerifiedGithubDelivery): NormalizedGithubEvent {
    const { eventName, payload } = delivery;

    if (!payload || typeof payload !== 'object') {
        return {
            type: 'unsupported',
            rawEvent: eventName,
        };
    }

    if (eventName === 'ping') {
        return {
            type: 'ping',
            zen: payload.zen,
            hookId: payload.hook_id,
            repositoryFullName: payload.repository?.full_name?.toLowerCase(),
        } as NormalizedPingEvent;
    }

    const repoFullName = payload.repository?.full_name?.toLowerCase() || '';

    switch (eventName) {
        case 'push': {
            const commits = Array.isArray(payload.commits)
                ? payload.commits.map((c: any) => ({
                      id: String(c.id || ''),
                      message: String(c.message || ''),
                      authorName: String(c.author?.name || c.committer?.name || 'Unknown'),
                  }))
                : [];

            return {
                type: 'push',
                repositoryFullName: repoFullName,
                ref: String(payload.ref || ''),
                compareUrl: String(payload.compare || payload.repository?.html_url || ''),
                pusherName: String(payload.pusher?.name || payload.sender?.login || 'GitHub'),
                senderAvatar: String(payload.sender?.avatar_url || ''),
                commits,
            } as NormalizedPushEvent;
        }

        case 'pull_request': {
            const pr = payload.pull_request || {};
            const action = String(payload.action || 'opened');
            const isMerged = action === 'closed' && Boolean(pr.merged);

            return {
                type: 'pull_request',
                repositoryFullName: repoFullName,
                action: isMerged ? 'merged' : action,
                prNumber: Number(pr.number || payload.number || 0),
                title: String(pr.title || 'Untitled Pull Request'),
                body: String(pr.body || ''),
                htmlUrl: String(pr.html_url || ''),
                userLogin: String(pr.user?.login || payload.sender?.login || 'ghost'),
                userAvatar: String(pr.user?.avatar_url || payload.sender?.avatar_url || ''),
                headRef: String(pr.head?.ref || ''),
                baseRef: String(pr.base?.ref || ''),
                additions: Number(pr.additions || 0),
                deletions: Number(pr.deletions || 0),
                merged: Boolean(pr.merged),
            } as NormalizedPullRequestEvent;
        }

        case 'issues': {
            const issue = payload.issue || {};
            const labels = Array.isArray(issue.labels)
                ? issue.labels.map((l: any) => (typeof l === 'string' ? l : l.name || ''))
                : [];

            return {
                type: 'issues',
                repositoryFullName: repoFullName,
                action: String(payload.action || 'opened'),
                issueNumber: Number(issue.number || 0),
                title: String(issue.title || 'Untitled Issue'),
                body: String(issue.body || ''),
                htmlUrl: String(issue.html_url || ''),
                userLogin: String(issue.user?.login || payload.sender?.login || 'ghost'),
                userAvatar: String(issue.user?.avatar_url || payload.sender?.avatar_url || ''),
                state: String(issue.state || 'open'),
                labels,
                assigneeLogin: issue.assignee?.login,
            } as NormalizedIssueEvent;
        }

        case 'release': {
            const release = payload.release || {};
            return {
                type: 'release',
                repositoryFullName: repoFullName,
                action: String(payload.action || 'published'),
                tagName: String(release.tag_name || ''),
                name: String(release.name || release.tag_name || 'Release'),
                htmlUrl: String(release.html_url || ''),
                authorLogin: String(release.author?.login || payload.sender?.login || 'ghost'),
                authorAvatar: String(release.author?.avatar_url || payload.sender?.avatar_url || ''),
                isPrerelease: Boolean(release.prerelease),
                publishedAt: String(release.published_at || new Date().toISOString()),
            } as NormalizedReleaseEvent;
        }

        case 'create': {
            return {
                type: 'create',
                repositoryFullName: repoFullName,
                ref: String(payload.ref || ''),
                refType: payload.ref_type === 'branch' ? 'branch' : 'tag',
                senderLogin: String(payload.sender?.login || 'ghost'),
                senderAvatar: String(payload.sender?.avatar_url || ''),
                htmlUrl: String(payload.repository?.html_url || ''),
            } as NormalizedBranchCreatedEvent;
        }

        case 'delete': {
            return {
                type: 'delete',
                repositoryFullName: repoFullName,
                ref: String(payload.ref || ''),
                refType: payload.ref_type === 'branch' ? 'branch' : 'tag',
                senderLogin: String(payload.sender?.login || 'ghost'),
                senderAvatar: String(payload.sender?.avatar_url || ''),
                htmlUrl: String(payload.repository?.html_url || ''),
            } as NormalizedBranchDeletedEvent;
        }

        default:
            return {
                type: 'unsupported',
                rawEvent: eventName,
                repositoryFullName: repoFullName,
            } as NormalizedUnsupportedEvent;
    }
}
