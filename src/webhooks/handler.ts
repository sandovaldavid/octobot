import { EventProcessor } from '@/pipeline/processor';
import { VerifiedGithubDelivery, ProcessingResult } from '@/pipeline/types';

export const handleGithubWebhook = async (
    event: string,
    payload: any,
    deliveryId: string = 'direct-invocation'
): Promise<ProcessingResult> => {
    const delivery: VerifiedGithubDelivery = {
        deliveryId,
        eventName: event,
        receivedAt: new Date(),
        payload,
    };

    return await EventProcessor.process(delivery);
};
