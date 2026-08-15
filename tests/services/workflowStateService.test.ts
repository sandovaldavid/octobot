import { describe, expect, it, spyOn, beforeEach } from 'bun:test';
import { WorkflowStateService } from '../../src/services/workflowStateService';
import { WorkflowAlertStateModel } from '../../src/models/workflowAlertState';

describe('Service - WorkflowStateService', () => {
    beforeEach(() => {
        // Reset spies
        spyOn(WorkflowAlertStateModel, 'findOneAndUpdate').mockImplementation((() => Promise.resolve({})) as any);
    });

    it('debe ignorar workflows no completados', async () => {
        const decision = await WorkflowStateService.evaluateTransition({
            repositoryFullName: 'sandovaldavid/octobot',
            workflowId: 100,
            headBranch: 'develop',
            runId: 1001,
            runNumber: 10,
            runAttempt: 1,
            action: 'in_progress',
            conclusion: undefined,
        });

        expect(decision.shouldNotify).toBe(false);
        expect(decision.alertType).toBe('none');
    });

    it('debe alertar fallo cuando el estado previo es healthy o inexistente (primer fallo)', async () => {
        spyOn(WorkflowAlertStateModel, 'findOne').mockResolvedValue(null as any);

        const decision = await WorkflowStateService.evaluateTransition({
            repositoryFullName: 'sandovaldavid/octobot',
            workflowId: 100,
            headBranch: 'develop',
            runId: 1001,
            runNumber: 10,
            runAttempt: 1,
            action: 'completed',
            conclusion: 'failure',
        });

        expect(decision.shouldNotify).toBe(true);
        expect(decision.alertType).toBe('failure');
        expect(decision.previousState).toBe('healthy');
        expect(decision.currentState).toBe('failing');
    });

    it('debe suprimir alertas repetidas si el workflow ya estaba failing', async () => {
        spyOn(WorkflowAlertStateModel, 'findOne').mockResolvedValue({
            state: 'failing',
            lastRunNumber: 10,
            lastRunAttempt: 1,
        } as any);

        const decision = await WorkflowStateService.evaluateTransition({
            repositoryFullName: 'sandovaldavid/octobot',
            workflowId: 100,
            headBranch: 'develop',
            runId: 1002,
            runNumber: 11,
            runAttempt: 1,
            action: 'completed',
            conclusion: 'failure',
        });

        expect(decision.shouldNotify).toBe(false);
        expect(decision.alertType).toBe('none');
        expect(decision.reason).toBe('repeated_failure_suppressed');
    });

    it('debe alertar recuperación (recovery) cuando un workflow previo failing pasa a success', async () => {
        spyOn(WorkflowAlertStateModel, 'findOne').mockResolvedValue({
            state: 'failing',
            lastRunNumber: 10,
            lastRunAttempt: 1,
        } as any);

        const decision = await WorkflowStateService.evaluateTransition({
            repositoryFullName: 'sandovaldavid/octobot',
            workflowId: 100,
            headBranch: 'develop',
            runId: 1003,
            runNumber: 11,
            runAttempt: 1,
            action: 'completed',
            conclusion: 'success',
        });

        expect(decision.shouldNotify).toBe(true);
        expect(decision.alertType).toBe('recovery');
        expect(decision.previousState).toBe('failing');
        expect(decision.currentState).toBe('healthy');
    });

    it('debe ignorar ejecuciones success cuando el workflow ya estaba healthy', async () => {
        spyOn(WorkflowAlertStateModel, 'findOne').mockResolvedValue({
            state: 'healthy',
            lastRunNumber: 10,
            lastRunAttempt: 1,
        } as any);

        const decision = await WorkflowStateService.evaluateTransition({
            repositoryFullName: 'sandovaldavid/octobot',
            workflowId: 100,
            headBranch: 'develop',
            runId: 1004,
            runNumber: 11,
            runAttempt: 1,
            action: 'completed',
            conclusion: 'success',
        });

        expect(decision.shouldNotify).toBe(false);
        expect(decision.alertType).toBe('none');
        expect(decision.reason).toBe('healthy_success_unnotified');
    });

    it('debe ignorar entregas fuera de orden o re-ejecuciones tardías (out of order)', async () => {
        spyOn(WorkflowAlertStateModel, 'findOne').mockResolvedValue({
            state: 'healthy',
            lastRunNumber: 12,
            lastRunAttempt: 2,
        } as any);

        // Attempt 1 of run 12 arrives after Attempt 2 was already recorded
        const decision = await WorkflowStateService.evaluateTransition({
            repositoryFullName: 'sandovaldavid/octobot',
            workflowId: 100,
            headBranch: 'develop',
            runId: 1000,
            runNumber: 12,
            runAttempt: 1,
            action: 'completed',
            conclusion: 'failure',
        });

        expect(decision.shouldNotify).toBe(false);
        expect(decision.alertType).toBe('none');
        expect(decision.reason).toBe('out_of_order_delivery');
    });
});
