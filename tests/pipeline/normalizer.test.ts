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

        const normalized = normalizeGithubEvent(delivery);
        expect(normalized.type).toBe('push');
        if (normalized.type === 'push') {
            expect(normalized.repositoryFullName).toBe('sandovaldavid/octobot');
            expect(normalized.ref).toBe('refs/heads/main');
            expect(normalized.commits.length).toBe(1);
            expect(normalized.commits[0].id).toBe('abc1234');
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

        const normalized = normalizeGithubEvent(delivery);
        expect(normalized.type).toBe('pull_request');
        if (normalized.type === 'pull_request') {
            expect(normalized.action).toBe('merged');
            expect(normalized.prNumber).toBe(42);
            expect(normalized.merged).toBe(true);
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

        const normalized = normalizeGithubEvent(delivery);
        expect(normalized.type).toBe('issues');
        if (normalized.type === 'issues') {
            expect(normalized.issueNumber).toBe(10);
            expect(normalized.action).toBe('opened');
            expect(normalized.labels).toEqual(['bug']);
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

        const normalized = normalizeGithubEvent(delivery);
        expect(normalized.type).toBe('ping');
    });

    it('debe marcar eventos no soportados como unsupported', () => {
        const delivery: VerifiedGithubDelivery = {
            deliveryId: 'del-unknown-1',
            eventName: 'workflow_run',
            receivedAt: new Date(),
            payload: {
                repository: { full_name: 'sandovaldavid/octobot' },
            },
        };

        const normalized = normalizeGithubEvent(delivery);
        expect(normalized.type).toBe('unsupported');
    });
});
