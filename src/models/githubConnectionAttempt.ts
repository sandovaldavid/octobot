import mongoose, { Document, Schema } from 'mongoose';

export interface IGitHubConnectionAttempt extends Document {
    installStateHash: string;
    oauthStateHash?: string;
    oauthCodeVerifier?: string;
    guildId: string;
    initiatedByDiscordUserId: string;
    candidateInstallationId?: number;
    status: 'pending_setup' | 'pending_oauth' | 'verifying' | 'consumed' | 'failed';
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const GitHubConnectionAttemptSchema = new Schema<IGitHubConnectionAttempt>(
    {
        installStateHash: { type: String, required: true, unique: true, index: true },
        oauthStateHash: { type: String, sparse: true, unique: true, index: true },
        oauthCodeVerifier: { type: String },
        guildId: { type: String, required: true, index: true },
        initiatedByDiscordUserId: { type: String, required: true },
        candidateInstallationId: { type: Number },
        status: {
            type: String,
            required: true,
            enum: ['pending_setup', 'pending_oauth', 'verifying', 'consumed', 'failed'],
            default: 'pending_setup',
            index: true,
        },
        expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    },
    { timestamps: true }
);

export const GitHubConnectionAttemptModel = mongoose.model<IGitHubConnectionAttempt>(
    'GitHubConnectionAttempt',
    GitHubConnectionAttemptSchema
);
