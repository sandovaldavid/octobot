import mongoose, { Document, Schema } from 'mongoose';

export interface IGitHubInstallation extends Document {
    installationId: number;
    accountId: number;
    accountLogin: string;
    accountType: 'Organization' | 'User';
    status: 'active' | 'suspended' | 'revoked';
    repositorySelection: 'all' | 'selected';
    permissions: Map<string, string> | Record<string, string>;
    events: string[];
    createdAt: Date;
    updatedAt: Date;
}

const GitHubInstallationSchema = new Schema<IGitHubInstallation>(
    {
        installationId: { type: Number, required: true, unique: true, index: true },
        accountId: { type: Number, required: true },
        accountLogin: { type: String, required: true, lowercase: true, trim: true, index: true },
        accountType: { type: String, required: true, enum: ['Organization', 'User'] },
        status: {
            type: String,
            required: true,
            enum: ['active', 'suspended', 'revoked'],
            default: 'active',
            index: true,
        },
        repositorySelection: { type: String, required: true, enum: ['all', 'selected'], default: 'all' },
        permissions: { type: Map, of: String, default: {} },
        events: { type: [String], default: [] },
    },
    { timestamps: true }
);

export const GitHubInstallationModel = mongoose.model<IGitHubInstallation>(
    'GitHubInstallation',
    GitHubInstallationSchema
);
