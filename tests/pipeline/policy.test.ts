import { describe, expect, it } from 'bun:test';
import { NotificationPolicy } from '../../src/pipeline/policy';
import {
    NormalizedPullRequestEvent,
    NormalizedPullRequestReviewEvent,
    NormalizedPushEvent,
    NormalizedWorkflowRunEvent,
} from '../../src/pipeline/types';

describe('Pipeline - Notification Policy', () => {
    it('debe aprobar acciones accionables de pull_request (opened, ready_for_review, review_requested, merged)', () => {
        const basePr: NormalizedPullRequestEvent = {
            type: 'pull_request',
            repositoryFullName: 'sandovaldavid/octobot',
            action: 'opened',
            prNumber: 42,
            title: 'Feat',
            body: '',
            htmlUrl: 'https://github.com',
            userLogin: 'dev',
            userAvatar: '',
            headRef: 'feat',
            baseRef: 'develop',
            additions: 10,
            deletions: 5,
            merged: false,
            draft: false,
            requestedReviewers: [],
        };

        expect(NotificationPolicy.shouldNotify({ ...basePr, action: 'opened' }).notify).toBe(true);
        expect(NotificationPolicy.shouldNotify({ ...basePr, action: 'ready_for_review' }).notify).toBe(true);
        expect(NotificationPolicy.shouldNotify({ ...basePr, action: 'review_requested' }).notify).toBe(true);
        expect(NotificationPolicy.shouldNotify({ ...basePr, action: 'merged' }).notify).toBe(true);
        expect(NotificationPolicy.shouldNotify({ ...basePr, action: 'reopened' }).notify).toBe(true);
    });

    it('debe filtrar acciones ruidosas de pull_request (synchronize, closed sin merge)', () => {
        const basePr: NormalizedPullRequestEvent = {
            type: 'pull_request',
            repositoryFullName: 'sandovaldavid/octobot',
            action: 'synchronize',
            prNumber: 42,
            title: 'Feat',
            body: '',
            htmlUrl: 'https://github.com',
            userLogin: 'dev',
            userAvatar: '',
            headRef: 'feat',
            baseRef: 'develop',
            additions: 10,
            deletions: 5,
            merged: false,
            draft: false,
            requestedReviewers: [],
        };

        const syncDecision = NotificationPolicy.shouldNotify(basePr);
        expect(syncDecision.notify).toBe(false);
        expect(syncDecision.reason).toContain('synchronize');

        const closedDecision = NotificationPolicy.shouldNotify({ ...basePr, action: 'closed' });
        expect(closedDecision.notify).toBe(false);
    });

    it('debe aprobar reviews submitted aprobadas o con cambios solicitados', () => {
        const baseReview: NormalizedPullRequestReviewEvent = {
            type: 'pull_request_review',
            repositoryFullName: 'sandovaldavid/octobot',
            action: 'submitted',
            reviewState: 'approved',
            prNumber: 42,
            prTitle: 'Feat',
            prHtmlUrl: 'https://github.com',
            prHeadRef: 'feat',
            prBaseRef: 'develop',
            reviewerLogin: 'reviewer',
            reviewerAvatar: '',
            htmlUrl: 'https://github.com',
        };

        expect(NotificationPolicy.shouldNotify(baseReview).notify).toBe(true);
        expect(NotificationPolicy.shouldNotify({ ...baseReview, reviewState: 'changes_requested' }).notify).toBe(true);
    });

    it('debe filtrar reviews commentadas, editadas o dismissed', () => {
        const baseReview: NormalizedPullRequestReviewEvent = {
            type: 'pull_request_review',
            repositoryFullName: 'sandovaldavid/octobot',
            action: 'submitted',
            reviewState: 'commented',
            prNumber: 42,
            prTitle: 'Feat',
            prHtmlUrl: 'https://github.com',
            prHeadRef: 'feat',
            prBaseRef: 'develop',
            reviewerLogin: 'reviewer',
            reviewerAvatar: '',
            htmlUrl: 'https://github.com',
        };

        expect(NotificationPolicy.shouldNotify(baseReview).notify).toBe(false);
        expect(NotificationPolicy.shouldNotify({ ...baseReview, action: 'edited' }).notify).toBe(false);
        expect(NotificationPolicy.shouldNotify({ ...baseReview, action: 'dismissed' }).notify).toBe(false);
    });

    it('debe aprobar workflow_run solo si completed y alertType es failure o recovery', () => {
        const baseWf: NormalizedWorkflowRunEvent = {
            type: 'workflow_run',
            repositoryFullName: 'sandovaldavid/octobot',
            action: 'completed',
            workflowId: 100,
            workflowName: 'CI',
            headBranch: 'develop',
            headSha: 'abcdef1',
            runId: 1001,
            runNumber: 1,
            runAttempt: 1,
            conclusion: 'failure',
            htmlUrl: 'https://github.com',
            senderLogin: 'dev',
            senderAvatar: '',
            alertType: 'failure',
        };

        expect(NotificationPolicy.shouldNotify({ ...baseWf, alertType: 'failure' }).notify).toBe(true);
        expect(NotificationPolicy.shouldNotify({ ...baseWf, alertType: 'recovery' }).notify).toBe(true);
        expect(NotificationPolicy.shouldNotify({ ...baseWf, alertType: 'none' }).notify).toBe(false);
        expect(NotificationPolicy.shouldNotify({ ...baseWf, action: 'in_progress', alertType: 'failure' }).notify).toBe(
            false
        );
    });

    it('debe aprobar eventos push, issues, release, create, delete', () => {
        const push: NormalizedPushEvent = {
            type: 'push',
            repositoryFullName: 'sandovaldavid/octobot',
            ref: 'refs/heads/main',
            compareUrl: '',
            pusherName: 'dev',
            senderAvatar: '',
            commits: [],
        };

        expect(NotificationPolicy.shouldNotify(push).notify).toBe(true);
    });
});
