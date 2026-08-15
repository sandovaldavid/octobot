import mongoose, { Document, Schema } from 'mongoose';
import { WEBHOOK_EVENTS, WebhookEventType } from '@/types/webhook';

export interface IRepositorySubscription extends Document {
    repositoryFullName: string;
    guildId?: string;
    channelId: string;
    events: WebhookEventType[];
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const repositorySubscriptionSchema = new Schema<IRepositorySubscription>(
    {
        repositoryFullName: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
            index: true,
        },
        guildId: {
            type: String,
            trim: true,
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
    },
    {
        timestamps: true,
    }
);

repositorySubscriptionSchema.index({ repositoryFullName: 1, channelId: 1 }, { unique: true });

export const RepositorySubscriptionModel = mongoose.model<IRepositorySubscription>(
    'RepositorySubscription',
    repositorySubscriptionSchema
);
