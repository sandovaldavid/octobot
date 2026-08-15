import { describe, expect, it } from 'bun:test';
import { WorkflowAlertStateModel } from '../../src/models/workflowAlertState';

describe('Model - WorkflowAlertStateModel', () => {
    it('debe definir correctamente el esquema y campos requeridos', () => {
        const schema = WorkflowAlertStateModel.schema;

        expect(schema.path('repositoryFullName')).toBeDefined();
        expect(schema.path('workflowId')).toBeDefined();
        expect(schema.path('headBranch')).toBeDefined();
        expect(schema.path('state')).toBeDefined();
        expect(schema.path('lastRunId')).toBeDefined();
        expect(schema.path('lastRunNumber')).toBeDefined();
        expect(schema.path('lastRunAttempt')).toBeDefined();
    });

    it('debe instanciar un estado con valores válidos', () => {
        const stateDoc = new WorkflowAlertStateModel({
            repositoryFullName: 'sandovaldavid/octobot',
            workflowId: 12345,
            headBranch: 'develop',
            state: 'failing',
            lastRunId: 9999,
            lastRunNumber: 42,
            lastRunAttempt: 1,
            lastFailureRunId: 9999,
            lastFailureAt: new Date(),
        });

        expect(stateDoc.repositoryFullName).toBe('sandovaldavid/octobot');
        expect(stateDoc.state).toBe('failing');
        expect(stateDoc.lastRunNumber).toBe(42);
    });

    it('debe fallar la validación si faltan campos obligatorios', () => {
        const invalidDoc = new WorkflowAlertStateModel({});
        const error = invalidDoc.validateSync();

        expect(error).toBeDefined();
        expect(error?.errors.repositoryFullName).toBeDefined();
        expect(error?.errors.workflowId).toBeDefined();
        expect(error?.errors.headBranch).toBeDefined();
        expect(error?.errors.state).toBeDefined();
    });
});
