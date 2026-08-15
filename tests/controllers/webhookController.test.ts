import { describe, expect, it, spyOn, beforeEach } from 'bun:test';
import { webhookController } from '../../src/controllers/webhookController';
import { DeliveryIdempotencyService } from '../../src/services/deliveryIdempotencyService';
import { EventProcessor } from '../../src/pipeline/processor';

describe('Controller - WebhookController Idempotency', () => {
    let processSpy: any;

    beforeEach(() => {
        processSpy = spyOn(EventProcessor, 'process').mockResolvedValue({
            deliveryId: 'del-1',
            eventName: 'push',
            outcome: 'delivered',
            matchedSubscriptions: 1,
            attempted: 1,
            succeeded: 1,
            failed: 0,
            durationMs: 5,
        });
        processSpy.mockClear();
    });

    it('debe procesar el evento cuando la entrega es reclamada exitosamente', async () => {
        spyOn(DeliveryIdempotencyService, 'claimDelivery').mockResolvedValue({
            claimed: true,
            isDuplicate: false,
        });

        const finalizeSpy = spyOn(DeliveryIdempotencyService, 'finalizeDelivery').mockResolvedValue();

        const req: any = {
            headers: {
                'x-github-event': 'push',
                'x-github-delivery': 'del-1',
            },
            body: { ref: 'refs/heads/main' },
        };

        let statusSent = 0;
        let jsonSent: any = null;

        const res: any = {
            status: (s: number) => {
                statusSent = s;
                return res;
            },
            json: (j: any) => {
                jsonSent = j;
                return res;
            },
        };

        await webhookController.handleWebhook(req, res);

        expect(statusSent).toBe(200);
        expect(processSpy).toHaveBeenCalled();
        expect(finalizeSpy).toHaveBeenCalledWith('del-1', 'delivered', 200);
        expect(jsonSent.delivered).toBe(1);
    });

    it('debe suprimir procesamiento y retornar 200 para entregas ya completadas sin llamar a EventProcessor', async () => {
        spyOn(DeliveryIdempotencyService, 'claimDelivery').mockResolvedValue({
            claimed: false,
            isDuplicate: true,
            status: 'completed',
            responseStatus: 200,
            outcome: 'ignored_duplicate',
        });

        const req: any = {
            headers: {
                'x-github-event': 'push',
                'x-github-delivery': 'del-dup-1',
            },
            body: {},
        };

        let statusSent = 0;
        let jsonSent: any = null;

        const res: any = {
            status: (s: number) => {
                statusSent = s;
                return res;
            },
            json: (j: any) => {
                jsonSent = j;
                return res;
            },
        };

        await webhookController.handleWebhook(req, res);

        expect(statusSent).toBe(200);
        expect(processSpy).not.toHaveBeenCalled();
        expect(jsonSent.duplicate).toBe(true);
        expect(jsonSent.outcome).toBe('ignored_duplicate');
    });

    it('debe suprimir procesamiento y retornar 202 para entregas en vuelo sin llamar a EventProcessor', async () => {
        spyOn(DeliveryIdempotencyService, 'claimDelivery').mockResolvedValue({
            claimed: false,
            isDuplicate: true,
            status: 'in_flight',
            responseStatus: 202,
            outcome: 'ignored_duplicate_in_flight',
        });

        const req: any = {
            headers: {
                'x-github-event': 'push',
                'x-github-delivery': 'del-inflight-1',
            },
            body: {},
        };

        let statusSent = 0;
        let jsonSent: any = null;

        const res: any = {
            status: (s: number) => {
                statusSent = s;
                return res;
            },
            json: (j: any) => {
                jsonSent = j;
                return res;
            },
        };

        await webhookController.handleWebhook(req, res);

        expect(statusSent).toBe(202);
        expect(processSpy).not.toHaveBeenCalled();
        expect(jsonSent.duplicate).toBe(true);
        expect(jsonSent.status).toBe('in_flight');
    });

    it('debe fallar cerrado retornando 503 si el servicio de idempotencia no puede establecer el claim', async () => {
        spyOn(DeliveryIdempotencyService, 'claimDelivery').mockRejectedValue(new Error('DB Timeout'));

        const req: any = {
            headers: {
                'x-github-event': 'push',
                'x-github-delivery': 'del-fail-1',
            },
            body: {},
        };

        let statusSent = 0;
        let jsonSent: any = null;

        const res: any = {
            status: (s: number) => {
                statusSent = s;
                return res;
            },
            json: (j: any) => {
                jsonSent = j;
                return res;
            },
        };

        await webhookController.handleWebhook(req, res);

        expect(statusSent).toBe(503);
        expect(processSpy).not.toHaveBeenCalled();
        expect(jsonSent.error).toContain('failed to establish delivery idempotency claim');
    });
});
