import { describe, expect, it } from 'bun:test';
import { normalizeGithubEvent } from '../../src/pipeline/normalizer';
import { VerifiedGithubDelivery } from '../../src/pipeline/types';

describe('Pipeline - Event Normalizer', () => {
    it('debe normalizar eventos push correctamente', () => {
        const delivery: VerifiedGithubDelivery = {
            deliveryId: 'del-push-1',
            eventName: 'push',
            receivedAt: new Date(),
            payload: {
                ref: 'refs/heads/main',
                compare: 'https://github.com/sandovaldavid/octobot/compare/1...2',
                repository: { full_name: 'sandovaldavid/octobot' },
                pusher: { name: 'sandovaldavid' },
                commits: [{ id: 'abc1234', message: 'feat: add feature', author: { name: 'sandovaldavid' } }],
            },
        };

        const result = normalizeGithubEvent(delivery);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.event.type).toBe('push');
            if (result.event.type === 'push') {
                expect(result.event.repositoryFullName).toBe('sandovaldavid/octobot');
                expect(result.event.ref).toBe('refs/heads/main');
                expect(result.event.commits.length).toBe(1);
                expect(result.event.commits[0].id).toBe('abc1234');
            }
        }
    });

    it('debe normalizar eventos pull_request correctamente identificando merges', () => {
        const delivery: VerifiedGithubDelivery = {
            deliveryId: 'del-pr-1',
            eventName: 'pull_request',
            receivedAt: new Date(),
            payload: {
                action: 'closed',
                repository: { full_name: 'sandovaldavid/octobot' },
                pull_request: {
                    number: 42,
                    title: 'New feature PR',
                    merged: true,
                    head: { ref: 'feature/branch' },
                    base: { ref: 'develop' },
                    additions: 10,
                    deletions: 2,
                    user: { login: 'octodev', avatar_url: 'https://avatar.url' },
                },
            },
        };

        const result = normalizeGithubEvent(delivery);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.event.type).toBe('pull_request');
            if (result.event.type === 'pull_request') {
                expect(result.event.action).toBe('merged');
                expect(result.event.prNumber).toBe(42);
                expect(result.event.merged).toBe(true);
            }
        }
    });

    it('debe normalizar eventos pull_request_review correctamente (approved)', () => {
        const delivery: VerifiedGithubDelivery = {
            deliveryId: 'del-review-1',
            eventName: 'pull_request_review',
            receivedAt: new Date(),
            payload: {
                action: 'submitted',
                repository: { full_name: 'sandovaldavid/octobot' },
                review: {
                    state: 'APPROVED',
                    body: 'LGTM!',
                    html_url: 'https://github.com/sandovaldavid/octobot/pull/42#pullrequestreview-1',
                    user: { login: 'lead-reviewer', avatar_url: 'https://avatar.url' },
                },
                pull_request: {
                    number: 42,
                    title: 'Refactor Pipeline',
                    html_url: 'https://github.com/sandovaldavid/octobot/pull/42',
                    head: { ref: 'feature/pipeline' },
                    base: { ref: 'develop' },
                },
            },
        };

        const result = normalizeGithubEvent(delivery);
        expect(result.success).toBe(true);
        if (result.success && result.event.type === 'pull_request_review') {
            expect(result.event.action).toBe('submitted');
            expect(result.event.reviewState).toBe('approved');
            expect(result.event.prNumber).toBe(42);
            expect(result.event.reviewerLogin).toBe('lead-reviewer');
            expect(result.event.body).toBe('LGTM!');
        }
    });

    it('debe rechazar eventos pull_request_review malformados sin review o pull_request', () => {
        const delivery: VerifiedGithubDelivery = {
            deliveryId: 'del-bad-review',
            eventName: 'pull_request_review',
            receivedAt: new Date(),
            payload: {
                action: 'submitted',
                repository: { full_name: 'sandovaldavid/octobot' },
            },
        };

        const result = normalizeGithubEvent(delivery);
        expect(result.success).toBe(false);
    });

    it('debe normalizar eventos workflow_run correctamente', () => {
        const delivery: VerifiedGithubDelivery = {
            deliveryId: 'del-wf-1',
            eventName: 'workflow_run',
            receivedAt: new Date(),
            payload: {
                action: 'completed',
                repository: { full_name: 'sandovaldavid/octobot' },
                workflow_run: {
                    id: 9999,
                    workflow_id: 1234,
                    name: 'CI / Test',
                    head_branch: 'develop',
                    head_sha: '1234567890abcdef',
                    run_number: 45,
                    run_attempt: 1,
                    conclusion: 'failure',
                    html_url: 'https://github.com/sandovaldavid/octobot/actions/runs/9999',
                },
                sender: { login: 'ci-bot', avatar_url: 'https://avatar.url' },
            },
        };

        const result = normalizeGithubEvent(delivery);
        expect(result.success).toBe(true);
        if (result.success && result.event.type === 'workflow_run') {
            expect(result.event.workflowId).toBe(1234);
            expect(result.event.workflowName).toBe('CI / Test');
            expect(result.event.headBranch).toBe('develop');
            expect(result.event.conclusion).toBe('failure');
            expect(result.event.runNumber).toBe(45);
        }
    });

    it('debe rechazar eventos workflow_run sin workflow_run object o head_branch', () => {
        const delivery: VerifiedGithubDelivery = {
            deliveryId: 'del-bad-wf',
            eventName: 'workflow_run',
            receivedAt: new Date(),
            payload: {
                action: 'completed',
                repository: { full_name: 'sandovaldavid/octobot' },
                workflow_run: {
                    id: 9999,
                    // missing workflow_id and head_branch
                },
            },
        };

        const result = normalizeGithubEvent(delivery);
        expect(result.success).toBe(false);
    });

    it('debe rechazar eventos pull_request malformados sin number o title', () => {
        const delivery: VerifiedGithubDelivery = {
            deliveryId: 'del-pr-invalid',
            eventName: 'pull_request',
            receivedAt: new Date(),
            payload: {
                action: 'opened',
                repository: { full_name: 'sandovaldavid/octobot' },
                pull_request: {
                    head: { ref: 'feat' },
                    base: { ref: 'develop' },
                },
            },
        };

        const result = normalizeGithubEvent(delivery);
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.reason).toContain('number');
        }
    });

    it('debe normalizar eventos issues correctamente', () => {
        const delivery: VerifiedGithubDelivery = {
            deliveryId: 'del-issue-1',
            eventName: 'issues',
            receivedAt: new Date(),
            payload: {
                action: 'opened',
                repository: { full_name: 'sandovaldavid/octobot' },
                issue: {
                    number: 10,
                    title: 'Critical Bug',
                    body: 'Something broke',
                    state: 'open',
                    labels: [{ name: 'bug' }],
                    user: { login: 'reporter', avatar_url: 'https://avatar.url' },
                },
            },
        };

        const result = normalizeGithubEvent(delivery);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.event.type).toBe('issues');
            if (result.event.type === 'issues') {
                expect(result.event.issueNumber).toBe(10);
                expect(result.event.action).toBe('opened');
                expect(result.event.labels).toEqual(['bug']);
            }
        }
    });

    it('debe rechazar eventos con repository.full_name faltante o no canónico', () => {
        const delivery: VerifiedGithubDelivery = {
            deliveryId: 'del-no-repo',
            eventName: 'issues',
            receivedAt: new Date(),
            payload: {
                action: 'opened',
                repository: { name: 'octobot' },
                issue: { number: 1, title: 'Test' },
            },
        };

        const result = normalizeGithubEvent(delivery);
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.reason).toContain('repository.full_name');
        }
    });

    it('debe normalizar eventos ping correctamente', () => {
        const delivery: VerifiedGithubDelivery = {
            deliveryId: 'del-ping-1',
            eventName: 'ping',
            receivedAt: new Date(),
            payload: {
                zen: 'Responsive is better than fast.',
                hook_id: 12345,
            },
        };

        const result = normalizeGithubEvent(delivery);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.event.type).toBe('ping');
        }
    });

    it('debe marcar eventos no soportados como unsupported', () => {
        const delivery: VerifiedGithubDelivery = {
            deliveryId: 'del-unknown-1',
            eventName: 'deployment',
            receivedAt: new Date(),
            payload: {
                repository: { full_name: 'sandovaldavid/octobot' },
            },
        };

        const result = normalizeGithubEvent(delivery);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.event.type).toBe('unsupported');
        }
    });
});
