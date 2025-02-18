import mongoose from 'mongoose';

const webhookSchema = new mongoose.Schema({
    type: {
        type: String,
        required: true,
        enum: ['issue', 'pull_request', 'push', 'release', 'watch','fork'],
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

export const WebhookModel = mongoose.model('Webhook', webhookSchema);
