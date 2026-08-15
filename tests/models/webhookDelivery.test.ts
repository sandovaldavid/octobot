import { describe, expect, it } from 'bun:test';
import { WebhookDeliveryModel } from '../../src/models/webhookDelivery';

describe('Model - WebhookDeliveryModel', () => {
    it('debe definir correctamente el esquema y campos requeridos', () => {
        const schema = WebhookDeliveryModel.schema;

        expect(schema.path('deliveryId')).toBeDefined();
        expect(schema.path('eventName')).toBeDefined();
        expect(schema.path('status')).toBeDefined();
        expect(schema.path('attemptCount')).toBeDefined();
        expect(schema.path('leaseExpiresAt')).toBeDefined();
        expect(schema.path('expiresAt')).toBeDefined();
    });

    it('debe instanciar un registro de delivery con valores válidos', () => {
        const doc = new WebhookDeliveryModel({
            deliveryId: 'test-delivery-guid-1',
            eventName: 'push',
            status: 'processing',
            leaseExpiresAt: new Date(Date.now() + 60000),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });

        expect(doc.deliveryId).toBe('test-delivery-guid-1');
        expect(doc.status).toBe('processing');
        expect(doc.attemptCount).toBe(1);
    });

    it('debe fallar la validación si faltan campos obligatorios', () => {
        const invalidDoc = new WebhookDeliveryModel({});
        const error = invalidDoc.validateSync();

        expect(error).toBeDefined();
        expect(error?.errors.deliveryId).toBeDefined();
        expect(error?.errors.eventName).toBeDefined();
        expect(error?.errors.leaseExpiresAt).toBeDefined();
        expect(error?.errors.expiresAt).toBeDefined();
    });
});
