import mongoose, { Document, Schema } from 'mongoose';

export type WorkflowHealthState = 'healthy' | 'failing';

export interface IWorkflowAlertState extends Document {
    repositoryFullName: string;
    workflowId: number;
    headBranch: string;
    state: WorkflowHealthState;
    lastRunId: number;
    lastRunNumber: number;
    lastRunAttempt: number;
    lastFailureRunId?: number;
    lastFailureAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const workflowAlertStateSchema = new Schema<IWorkflowAlertState>(
    {
        repositoryFullName: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
            index: true,
        },
        workflowId: {
            type: Number,
            required: true,
            index: true,
        },
        headBranch: {
            type: String,
            required: true,
            trim: true,
        },
        state: {
            type: String,
            enum: ['healthy', 'failing'],
            required: true,
        },
        lastRunId: {
            type: Number,
            required: true,
        },
        lastRunNumber: {
            type: Number,
            required: true,
        },
        lastRunAttempt: {
            type: Number,
            required: true,
        },
        lastFailureRunId: {
            type: Number,
        },
        lastFailureAt: {
            type: Date,
        },
    },
    {
        timestamps: true,
    }
);

workflowAlertStateSchema.index({ repositoryFullName: 1, workflowId: 1, headBranch: 1 }, { unique: true });

export const WorkflowAlertStateModel = mongoose.model<IWorkflowAlertState>(
    'WorkflowAlertState',
    workflowAlertStateSchema
);
