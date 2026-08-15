import mongoose, { Document, Schema } from 'mongoose';

export type DeliveryStatus = 'processing' | 'completed' | 'rejected' | 'retryable_failed';

export interface IWebhookDelivery extends Document {
    deliveryId: string;
    eventName: string;
    status: DeliveryStatus;
    attemptCount: number;
    firstReceivedAt: Date;
    lastAttemptAt: Date;
    processingStartedAt?: Date;
    leaseExpiresAt?: Date;
    completedAt?: Date;
    finalOutcome?: string;
    responseStatus?: number;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const webhookDeliverySchema = new Schema<IWebhookDelivery>(
    {
        deliveryId: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            index: true,
        },
        eventName: {
            type: String,
            required: true,
            trim: true,
        },
        status: {
            type: String,
            enum: ['processing', 'completed', 'rejected', 'retryable_failed'],
            required: true,
            default: 'processing',
        },
        attemptCount: {
            type: Number,
            required: true,
            default: 1,
        },
        firstReceivedAt: {
            type: Date,
            required: true,
            default: Date.now,
        },
        lastAttemptAt: {
            type: Date,
            required: true,
            default: Date.now,
        },
        processingStartedAt: {
            type: Date,
            default: Date.now,
        },
        leaseExpiresAt: {
            type: Date,
            required: true,
        },
        completedAt: {
            type: Date,
        },
        finalOutcome: {
            type: String,
        },
        responseStatus: {
            type: Number,
        },
        expiresAt: {
            type: Date,
            required: true,
            index: { expires: 0 },
        },
    },
    {
        timestamps: true,
    }
);

export const WebhookDeliveryModel = mongoose.model<IWebhookDelivery>('WebhookDelivery', webhookDeliverySchema);
