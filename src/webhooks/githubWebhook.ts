import { WebhookModel } from '@models/webhook.model';

export const saveWebhook = async (type: string, repositoryName: string, payload: any) => {
    try {
        const webhook = new WebhookModel({
            type,
            repositoryName,
            payload,
        });
        await webhook.save();
        debug.info('Webhook saved successfully');
    } catch (error) {
        debug.error('Error saving webhook:', error);
        throw error;
    }
};
