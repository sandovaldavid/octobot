import mongoose from 'mongoose';
import { WEBHOOK_EVENTS, WebhookEventType } from '@/types/webhook';

const webhookSchema = new mongoose.Schema({
    type: {
        type: String,
        required: true,
        enum: WEBHOOK_EVENTS,
    },
    repositoryName: {
        type: String,
        required: true,
    },
    payload: {
        type: mongoose.Schema.Types.Mixed,
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

webhookSchema.index({ type: 1, repositoryName: 1 });
webhookSchema.index({ createdAt: -1 });

export const WebhookModel = mongoose.model('Webhook', webhookSchema);
