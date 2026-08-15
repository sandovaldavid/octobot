import { describe, expect, it, spyOn, afterEach } from 'bun:test';
import { EventProcessor } from '../../src/pipeline/processor';
import { SubscriptionRouter } from '../../src/pipeline/router';
import { VerifiedGithubDelivery } from '../../src/pipeline/types';
import { WorkflowStateService } from '../../src/services/workflowStateService';

describe('Pipeline - Event Processor', () => {
    let routerSpy: any;
    let wfSpy: any;

    afterEach(() => {
        if (routerSpy?.mockRestore) routerSpy.mockRestore();
        if (wfSpy?.mockRestore) wfSpy.mockRestore();
    });

    it('debe retornar invalid_payload cuando el payload está malformado', async () => {
        const delivery: VerifiedGithubDelivery = {
            deliveryId: 'invalid-delivery-1',
            eventName: 'pull_request',
            receivedAt: new Date(),
            payload: {
                action: 'opened',
                repository: { full_name: 'sandovaldavid/octobot' },
                pull_request: {}, // missing number, title, etc.
            },
        };

        const result = await EventProcessor.process(delivery);
        expect(result.outcome).toBe('invalid_payload');
        expect(result.attempted).toBe(0);
        expect(result.error).toBeDefined();
    });

    it('debe retornar ignored_policy cuando el evento es filtrado por la política de notificaciones', async () => {
        const delivery: VerifiedGithubDelivery = {
            deliveryId: 'sync-delivery-1',
            eventName: 'pull_request',
            receivedAt: new Date(),
            payload: {
                action: 'synchronize',
                repository: { full_name: 'sandovaldavid/octobot' },
                pull_request: {
                    number: 42,
                    title: 'WIP Commit',
                    head: { ref: 'feature/pr' },
                    base: { ref: 'develop' },
                },
            },
        };

        const result = await EventProcessor.process(delivery);
        expect(result.outcome).toBe('ignored_policy');
        expect(result.attempted).toBe(0);
    });

    it('debe evaluar workflow_run y filtrar por política si no hay alerta accionable', async () => {
        wfSpy = spyOn(WorkflowStateService, 'evaluateTransition').mockResolvedValue({
            shouldNotify: false,
            alertType: 'none',
            reason: 'repeated_failure_suppressed',
        });

        const delivery: VerifiedGithubDelivery = {
            deliveryId: 'wf-delivery-1',
            eventName: 'workflow_run',
            receivedAt: new Date(),
            payload: {
                action: 'completed',
                repository: { full_name: 'sandovaldavid/octobot' },
                workflow_run: {
                    id: 1234,
                    workflow_id: 10,
                    name: 'CI',
                    head_branch: 'develop',
                    head_sha: 'abc1234',
                    run_number: 1,
                    run_attempt: 1,
                    conclusion: 'failure',
                },
            },
        };

        const result = await EventProcessor.process(delivery);
        expect(result.outcome).toBe('ignored_policy');
        expect(result.attempted).toBe(0);
    });

    it('debe retornar ignored_ping para eventos de ping', async () => {
        const delivery: VerifiedGithubDelivery = {
            deliveryId: 'ping-delivery-1',
            eventName: 'ping',
            receivedAt: new Date(),
            payload: { zen: 'Keep it simple.' },
        };

        const result = await EventProcessor.process(delivery);
        expect(result.outcome).toBe('ignored_ping');
        expect(result.attempted).toBe(0);
        expect(result.matchedSubscriptions).toBe(0);
    });

    it('debe retornar ignored_unsupported_event para eventos sin soporte funcional', async () => {
        const delivery: VerifiedGithubDelivery = {
            deliveryId: 'unsupported-delivery-1',
            eventName: 'deployment',
            receivedAt: new Date(),
            payload: { repository: { full_name: 'sandovaldavid/octobot' } },
        };

        const result = await EventProcessor.process(delivery);
        expect(result.outcome).toBe('ignored_unsupported_event');
        expect(result.attempted).toBe(0);
    });

    it('debe retornar ignored_no_subscription cuando no hay suscripciones activas', async () => {
        routerSpy = spyOn(SubscriptionRouter, 'resolveTargetChannels').mockResolvedValue({
            matchedSubscriptionsCount: 0,
            targetChannelIds: [],
        });

        const delivery: VerifiedGithubDelivery = {
            deliveryId: 'no-sub-delivery-1',
            eventName: 'push',
            receivedAt: new Date(),
            payload: {
                ref: 'refs/heads/main',
                repository: { full_name: 'unregistered/repository' },
                commits: [],
            },
        };

        const result = await EventProcessor.process(delivery);
        expect(result.outcome).toBe('ignored_no_subscription');
        expect(result.matchedSubscriptions).toBe(0);
    });

    it('debe retornar ignored_subscription_filter cuando el evento está filtrado por preferencias', async () => {
        routerSpy = spyOn(SubscriptionRouter, 'resolveTargetChannels').mockResolvedValue({
            matchedSubscriptionsCount: 1,
            targetChannelIds: [],
        });

        const delivery: VerifiedGithubDelivery = {
            deliveryId: 'filter-delivery-1',
            eventName: 'push',
            receivedAt: new Date(),
            payload: {
                ref: 'refs/heads/main',
                repository: { full_name: 'sandovaldavid/octobot' },
                commits: [],
            },
        };

        const result = await EventProcessor.process(delivery);
        expect(result.outcome).toBe('ignored_subscription_filter');
        expect(result.matchedSubscriptions).toBe(1);
        expect(result.attempted).toBe(0);
    });
});
