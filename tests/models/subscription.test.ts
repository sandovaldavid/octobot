import { describe, expect, it } from 'bun:test';
import { RepositorySubscriptionModel } from '../../src/models/subscription';
import { WEBHOOK_EVENTS } from '../../src/types/webhook';

describe('Model - RepositorySubscriptionModel', () => {
    it('debe definir correctamente el esquema y campos requeridos', () => {
        const schema = RepositorySubscriptionModel.schema;

        expect(schema.path('repositoryFullName')).toBeDefined();
        expect(schema.path('channelId')).toBeDefined();
        expect(schema.path('events')).toBeDefined();
        expect(schema.path('active')).toBeDefined();
    });

    it('debe instanciar una subscripción con valores válidos', () => {
        const sub = new RepositorySubscriptionModel({
            repositoryFullName: 'sandovaldavid/octobot',
            guildId: '123456789012345678',
            channelId: '987654321098765432',
            events: WEBHOOK_EVENTS,
            active: true,
        });

        expect(sub.repositoryFullName).toBe('sandovaldavid/octobot');
        expect(sub.channelId).toBe('987654321098765432');
        expect(sub.events.length).toBe(WEBHOOK_EVENTS.length);
        expect(sub.active).toBe(true);
    });

    it('debe fallar la validación si faltan campos obligatorios', () => {
        const invalidSub = new RepositorySubscriptionModel({});
        const error = invalidSub.validateSync();

        expect(error).toBeDefined();
        expect(error?.errors.repositoryFullName).toBeDefined();
        expect(error?.errors.channelId).toBeDefined();
    });
});
