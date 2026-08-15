import { WorkflowAlertStateModel, WorkflowHealthState } from '@models/workflowAlertState';
import { WorkflowAlertType } from '@/pipeline/types';
import { debug } from '@utils/logger';

export interface WorkflowTransitionInput {
    repositoryFullName: string;
    workflowId: number;
    headBranch: string;
    runId: number;
    runNumber: number;
    runAttempt: number;
    action: string;
    conclusion?: string;
}

export interface WorkflowTransitionDecision {
    shouldNotify: boolean;
    alertType: WorkflowAlertType;
    previousState?: WorkflowHealthState;
    currentState?: WorkflowHealthState;
    reason?: string;
}

export const ACTIONABLE_FAILURE_CONCLUSIONS = ['failure', 'timed_out', 'startup_failure', 'action_required'] as const;

export class WorkflowStateService {
    static async evaluateTransition(input: WorkflowTransitionInput): Promise<WorkflowTransitionDecision> {
        const { repositoryFullName, workflowId, headBranch, runId, runNumber, runAttempt, action, conclusion } = input;

        // Only completed actions can transition workflow health states
        if (action !== 'completed' || !conclusion) {
            return {
                shouldNotify: false,
                alertType: 'none',
                reason: `Workflow run is not completed (action=${action}, conclusion=${conclusion || 'none'})`,
            };
        }

        const canonicalRepo = repositoryFullName.toLowerCase();

        const existing = await WorkflowAlertStateModel.findOne({
            repositoryFullName: canonicalRepo,
            workflowId,
            headBranch,
        });

        // Out-of-order delivery / late rerun protection
        if (existing) {
            const isOlderRun = runNumber < existing.lastRunNumber;
            const isOlderAttempt = runNumber === existing.lastRunNumber && runAttempt < existing.lastRunAttempt;

            if (isOlderRun || isOlderAttempt) {
                debug.warn(
                    `Ignoring out-of-order workflow_run delivery for ${canonicalRepo} (run #${runNumber} attempt ${runAttempt} vs recorded #${existing.lastRunNumber} attempt ${existing.lastRunAttempt})`
                );
                return {
                    shouldNotify: false,
                    alertType: 'none',
                    previousState: existing.state,
                    currentState: existing.state,
                    reason: 'out_of_order_delivery',
                };
            }
        }

        const isFailure = ACTIONABLE_FAILURE_CONCLUSIONS.includes(
            conclusion as (typeof ACTIONABLE_FAILURE_CONCLUSIONS)[number]
        );
        const isSuccess = conclusion === 'success';

        // 1. Failure Scenario
        if (isFailure) {
            const previousState: WorkflowHealthState = existing?.state || 'healthy';

            if (previousState !== 'failing') {
                // Transition: healthy -> failing (First failure => Notify 🔴)
                await WorkflowAlertStateModel.findOneAndUpdate(
                    { repositoryFullName: canonicalRepo, workflowId, headBranch },
                    {
                        repositoryFullName: canonicalRepo,
                        workflowId,
                        headBranch,
                        state: 'failing',
                        lastRunId: runId,
                        lastRunNumber: runNumber,
                        lastRunAttempt: runAttempt,
                        lastFailureRunId: runId,
                        lastFailureAt: new Date(),
                    },
                    { upsert: true, new: true }
                );

                return {
                    shouldNotify: true,
                    alertType: 'failure',
                    previousState,
                    currentState: 'failing',
                };
            } else {
                // Repeated failure while already in failing state -> Update run metadata, suppress alert
                await WorkflowAlertStateModel.findOneAndUpdate(
                    { repositoryFullName: canonicalRepo, workflowId, headBranch },
                    {
                        lastRunId: runId,
                        lastRunNumber: runNumber,
                        lastRunAttempt: runAttempt,
                        lastFailureRunId: runId,
                        lastFailureAt: new Date(),
                    }
                );

                return {
                    shouldNotify: false,
                    alertType: 'none',
                    previousState: 'failing',
                    currentState: 'failing',
                    reason: 'repeated_failure_suppressed',
                };
            }
        }

        // 2. Success Scenario
        if (isSuccess) {
            const previousState: WorkflowHealthState = existing?.state || 'healthy';

            if (previousState === 'failing') {
                // Transition: failing -> healthy (Recovery => Notify 🟢)
                await WorkflowAlertStateModel.findOneAndUpdate(
                    { repositoryFullName: canonicalRepo, workflowId, headBranch },
                    {
                        state: 'healthy',
                        lastRunId: runId,
                        lastRunNumber: runNumber,
                        lastRunAttempt: runAttempt,
                    }
                );

                return {
                    shouldNotify: true,
                    alertType: 'recovery',
                    previousState: 'failing',
                    currentState: 'healthy',
                };
            } else {
                // Already healthy -> Record run update, do not notify
                await WorkflowAlertStateModel.findOneAndUpdate(
                    { repositoryFullName: canonicalRepo, workflowId, headBranch },
                    {
                        repositoryFullName: canonicalRepo,
                        workflowId,
                        headBranch,
                        state: 'healthy',
                        lastRunId: runId,
                        lastRunNumber: runNumber,
                        lastRunAttempt: runAttempt,
                    },
                    { upsert: true }
                );

                return {
                    shouldNotify: false,
                    alertType: 'none',
                    previousState: 'healthy',
                    currentState: 'healthy',
                    reason: 'healthy_success_unnotified',
                };
            }
        }

        // 3. Other unmonitored conclusions (cancelled, neutral, skipped, stale, etc.)
        if (existing) {
            await WorkflowAlertStateModel.findOneAndUpdate(
                { repositoryFullName: canonicalRepo, workflowId, headBranch },
                {
                    lastRunId: runId,
                    lastRunNumber: runNumber,
                    lastRunAttempt: runAttempt,
                }
            );
        }

        return {
            shouldNotify: false,
            alertType: 'none',
            previousState: existing?.state || 'healthy',
            currentState: existing?.state || 'healthy',
            reason: `unmonitored_conclusion_${conclusion}`,
        };
    }
}
