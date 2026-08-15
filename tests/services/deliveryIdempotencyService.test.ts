import { describe, expect, it, spyOn, beforeEach, afterEach } from 'bun:test';
import { DeliveryIdempotencyService } from '../../src/services/deliveryIdempotencyService';
import { WebhookDeliveryModel } from '../../src/models/webhookDelivery';

describe('Service - DeliveryIdempotencyService', () => {
    let findOneAndUpdateSpy: any;
    let createSpy: any;
    let findOneSpy: any;

    beforeEach(() => {
        findOneAndUpdateSpy = spyOn(WebhookDeliveryModel, 'findOneAndUpdate').mockImplementation((() =>
            Promise.resolve({})) as any);
    });

    afterEach(() => {
        if (findOneAndUpdateSpy?.mockRestore) findOneAndUpdateSpy.mockRestore();
        if (createSpy?.mockRestore) createSpy.mockRestore();
        if (findOneSpy?.mockRestore) findOneSpy.mockRestore();
    });

    it('debe reclamar exitosamente una entrega nueva (primer intento)', async () => {
        createSpy = spyOn(WebhookDeliveryModel, 'create').mockResolvedValue({} as any);

        const result = await DeliveryIdempotencyService.claimDelivery('guid-new-1', 'push');
        expect(result.claimed).toBe(true);
        expect(result.isDuplicate).toBe(false);
    });

    it('debe suprimir procesamiento y retornar 200 para entregas ya completadas', async () => {
        createSpy = spyOn(WebhookDeliveryModel, 'create').mockRejectedValue({ code: 11000, name: 'MongoServerError' });
        findOneSpy = spyOn(WebhookDeliveryModel, 'findOne').mockResolvedValue({
            deliveryId: 'guid-completed-1',
            status: 'completed',
            finalOutcome: 'delivered',
        } as any);

        const result = await DeliveryIdempotencyService.claimDelivery('guid-completed-1', 'push');
        expect(result.claimed).toBe(false);
        expect(result.isDuplicate).toBe(true);
        expect(result.status).toBe('completed');
        expect(result.responseStatus).toBe(200);
        expect(result.outcome).toBe('delivered');
    });

    it('debe suprimir procesamiento y retornar 400 para entregas previamente rechazadas', async () => {
        createSpy = spyOn(WebhookDeliveryModel, 'create').mockRejectedValue({ code: 11000, name: 'MongoServerError' });
        findOneSpy = spyOn(WebhookDeliveryModel, 'findOne').mockResolvedValue({
            deliveryId: 'guid-rejected-1',
            status: 'rejected',
            finalOutcome: 'invalid_payload',
        } as any);

        const result = await DeliveryIdempotencyService.claimDelivery('guid-rejected-1', 'pull_request');
        expect(result.claimed).toBe(false);
        expect(result.isDuplicate).toBe(true);
        expect(result.status).toBe('rejected');
        expect(result.responseStatus).toBe(400);
        expect(result.outcome).toBe('invalid_payload');
    });

    it('debe suprimir procesamiento concurrente y retornar 202 para entregas en vuelo con lease activo', async () => {
        createSpy = spyOn(WebhookDeliveryModel, 'create').mockRejectedValue({ code: 11000, name: 'MongoServerError' });
        findOneSpy = spyOn(WebhookDeliveryModel, 'findOne').mockResolvedValue({
            deliveryId: 'guid-in-flight-1',
            status: 'processing',
            leaseExpiresAt: new Date(Date.now() + 30000), // active lease
        } as any);

        const result = await DeliveryIdempotencyService.claimDelivery('guid-in-flight-1', 'push');
        expect(result.claimed).toBe(false);
        expect(result.isDuplicate).toBe(true);
        expect(result.status).toBe('in_flight');
        expect(result.responseStatus).toBe(202);
        expect(result.outcome).toBe('ignored_duplicate_in_flight');
    });

    it('debe permitir recuperar atómicamente el lease si la entrega en vuelo expiró (crash recovery)', async () => {
        createSpy = spyOn(WebhookDeliveryModel, 'create').mockRejectedValue({ code: 11000, name: 'MongoServerError' });
        findOneSpy = spyOn(WebhookDeliveryModel, 'findOne').mockResolvedValue({
            deliveryId: 'guid-expired-1',
            status: 'processing',
            leaseExpiresAt: new Date(Date.now() - 10000), // expired lease
        } as any);

        findOneAndUpdateSpy = spyOn(WebhookDeliveryModel, 'findOneAndUpdate').mockResolvedValue({
            deliveryId: 'guid-expired-1',
            status: 'processing',
        } as any);

        const result = await DeliveryIdempotencyService.claimDelivery('guid-expired-1', 'push');
        expect(result.claimed).toBe(true);
        expect(result.isDuplicate).toBe(false);
        expect(result.isReclaim).toBe(true);
    });

    it('debe permitir reintentar atómicamente entregas con estado retryable_failed', async () => {
        createSpy = spyOn(WebhookDeliveryModel, 'create').mockRejectedValue({ code: 11000, name: 'MongoServerError' });
        findOneSpy = spyOn(WebhookDeliveryModel, 'findOne').mockResolvedValue({
            deliveryId: 'guid-failed-1',
            status: 'retryable_failed',
        } as any);

        findOneAndUpdateSpy = spyOn(WebhookDeliveryModel, 'findOneAndUpdate').mockResolvedValue({
            deliveryId: 'guid-failed-1',
            status: 'processing',
        } as any);

        const result = await DeliveryIdempotencyService.claimDelivery('guid-failed-1', 'push');
        expect(result.claimed).toBe(true);
        expect(result.isDuplicate).toBe(false);
        expect(result.isRetry).toBe(true);
    });

    it('debe fallar cerrado (throw) ante errores no relacionados con clave duplicada', async () => {
        createSpy = spyOn(WebhookDeliveryModel, 'create').mockRejectedValue(new Error('Connection lost'));

        expect(DeliveryIdempotencyService.claimDelivery('guid-err-1', 'push')).rejects.toThrow('Connection lost');
    });

    it('debe mapear correctamente los outcomes al finalizar la entrega', async () => {
        let updateArgs: any = null;
        findOneAndUpdateSpy = spyOn(WebhookDeliveryModel, 'findOneAndUpdate').mockImplementation(((
            filter: any,
            update: any
        ) => {
            updateArgs = update;
            return Promise.resolve({});
        }) as any);

        // 1. Success outcome -> completed
        await DeliveryIdempotencyService.finalizeDelivery('guid-1', 'delivered', 200);
        expect(updateArgs.$set.status).toBe('completed');
        expect(updateArgs.$set.finalOutcome).toBe('delivered');

        // 2. Invalid payload -> rejected
        await DeliveryIdempotencyService.finalizeDelivery('guid-2', 'invalid_payload', 400);
        expect(updateArgs.$set.status).toBe('rejected');

        // 3. Systemic failure -> retryable_failed
        await DeliveryIdempotencyService.finalizeDelivery('guid-3', 'failed', 500);
        expect(updateArgs.$set.status).toBe('retryable_failed');
    });
});
