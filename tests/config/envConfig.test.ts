import { describe, expect, it } from 'bun:test';
import { validateEnv } from '../../src/config/envConfig';

describe('Configuration - validateEnv', () => {
    const validConfig = {
        PORT: '3000',
        NODE_ENV: 'test',
        DISCORD_TOKEN: 'mock_discord_token',
        DISCORD_CLIENT_ID: '123456789012345678',
        DISCORD_GUILD_ID: '876543210987654321',
        DISCORD_CHANNEL_ID: '112233445566778899',
        MONGODB_URI: 'mongodb://localhost:27017/test_db',
        GITHUB_TOKEN: 'ghp_mock_token',
        GITHUB_OWNER: 'test-owner',
        GITHUB_REPO: 'test-repo',
        GITHUB_WEBHOOK_SECRET: 'test_secret',
        API_URL: 'https://test.example.com',
    };

    it('debe validar y cargar correctamente la configuración completa', () => {
        const env = validateEnv(validConfig);

        expect(env.PORT).toBe(3000);
        expect(env.NODE_ENV).toBe('test');
        expect(env.DISCORD_TOKEN).toBe('mock_discord_token');
        expect(env.GITHUB_OWNER).toBe('test-owner');
        expect(env.API_URL).toBe('https://test.example.com');
    });

    it('debe lanzar error cuando faltan variables requeridas', () => {
        const incompleteConfig = {
            ...validConfig,
            DISCORD_TOKEN: undefined,
            GITHUB_TOKEN: undefined,
        };

        expect(() => validateEnv(incompleteConfig as any)).toThrow(
            'Variables de entorno críticas faltantes: DISCORD_TOKEN, GITHUB_TOKEN'
        );
    });

    it('debe usar puerto 4000 por defecto si PORT no está definido', () => {
        const configWithoutPort = {
            ...validConfig,
            PORT: undefined,
        };

        const env = validateEnv(configWithoutPort as any);
        expect(env.PORT).toBe(4000);
    });
});
