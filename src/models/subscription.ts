import mongoose, { Document, Schema } from 'mongoose';
import { WEBHOOK_EVENTS, WebhookEventType } from '@/types/webhook';

export interface IRepositorySubscription extends Document {
    repositoryId?: number;
    repositoryFullName: string;
    installationId?: number;
    guildId?: string;
    channelId: string;
    events: WebhookEventType[];
    active: boolean;
    createdByDiscordUserId?: string;
    createdAt: Date;
    updatedAt: Date;
}

export type ISubscription = IRepositorySubscription;

const repositorySubscriptionSchema = new Schema<IRepositorySubscription>(
    {
        repositoryId: {
            type: Number,
            index: true,
        },
        repositoryFullName: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
            index: true,
        },
        installationId: {
            type: Number,
            index: true,
        },
        guildId: {
            type: String,
            trim: true,
            index: true,
        },
        channelId: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        events: [
            {
                type: String,
                enum: WEBHOOK_EVENTS,
            },
        ],
        active: {
            type: Boolean,
            default: true,
            index: true,
        },
        createdByDiscordUserId: {
            type: String,
            trim: true,
        },
    },
    {
        timestamps: true,
    }
);

// Compound Unique index for multi-tenant isolation per channel
repositorySubscriptionSchema.index(
    { installationId: 1, repositoryId: 1, guildId: 1, channelId: 1 },
    { unique: true, sparse: true }
);

// High-performance event routing index for webhook dispatch
repositorySubscriptionSchema.index({ installationId: 1, repositoryId: 1, active: 1 });

// Legacy compatibility unique index
repositorySubscriptionSchema.index({ repositoryFullName: 1, channelId: 1 }, { unique: true, sparse: true });

export const RepositorySubscriptionModel = mongoose.model<IRepositorySubscription>(
    'RepositorySubscription',
    repositorySubscriptionSchema
);

export const SubscriptionModel = RepositorySubscriptionModel;
