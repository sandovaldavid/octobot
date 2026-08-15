import { describe, expect, it } from 'bun:test';
import { validateEnv } from '../../src/config/envConfig';

describe('Configuration - validateEnv', () => {
    const validLegacyConfig = {
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

    const validGitHubAppConfig = {
        PORT: '4000',
        NODE_ENV: 'production',
        DISCORD_TOKEN: 'mock_discord_token',
        DISCORD_CLIENT_ID: '123456789012345678',
        MONGODB_URI: 'mongodb://localhost:27017/test_db',
        API_URL: 'https://test.example.com',
        GITHUB_APP_ID: '123456',
        GITHUB_APP_PRIVATE_KEY: '-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----',
        GITHUB_WEBHOOK_SECRET: 'test_app_webhook_secret',
        GITHUB_CLIENT_ID: 'Iv1.test_client_id',
        GITHUB_CLIENT_SECRET: 'test_client_secret',
    };

    it('debe validar y cargar correctamente la configuración en modo legacy PAT', () => {
        const env = validateEnv(validLegacyConfig);

        expect(env.authMode).toBe('legacy_pat');
        expect(env.PORT).toBe(3000);
        expect(env.NODE_ENV).toBe('test');
        expect(env.DISCORD_TOKEN).toBe('mock_discord_token');
        expect(env.DISCORD_GUILD_ID).toBe('876543210987654321');
        expect(env.GITHUB_OWNER).toBe('test-owner');
        expect(env.API_URL).toBe('https://test.example.com');
    });

    it('debe validar y cargar correctamente la configuración en modo canonical GitHub App sin requerir variables legacy', () => {
        const env = validateEnv(validGitHubAppConfig);

        expect(env.authMode).toBe('github_app');
        expect(env.PORT).toBe(4000);
        expect(env.NODE_ENV).toBe('production');
        expect(env.DISCORD_TOKEN).toBe('mock_discord_token');
        expect(env.DISCORD_CLIENT_ID).toBe('123456789012345678');
        expect(env.GITHUB_APP_ID).toBe(123456);
        expect(env.GITHUB_CLIENT_ID).toBe('Iv1.test_client_id');
        expect(env.GITHUB_TOKEN).toBeUndefined();
        expect(env.DISCORD_GUILD_ID).toBeUndefined();
    });

    it('debe lanzar error cuando faltan variables requeridas en modo legacy', () => {
        const incompleteConfig = {
            ...validLegacyConfig,
            DISCORD_TOKEN: undefined,
            GITHUB_TOKEN: undefined,
        };

        expect(() => validateEnv(incompleteConfig as any)).toThrow(
            'Variables de entorno críticas faltantes: DISCORD_TOKEN, GITHUB_TOKEN'
        );
    });

    it('debe lanzar error cuando faltan variables requeridas en modo GitHub App', () => {
        const incompleteAppConfig = {
            ...validGitHubAppConfig,
            DISCORD_TOKEN: undefined,
        };

        expect(() => validateEnv(incompleteAppConfig as any)).toThrow(
            'Variables de entorno críticas faltantes: DISCORD_TOKEN'
        );
    });

    it('debe usar puerto 4000 por defecto si PORT no está definido', () => {
        const configWithoutPort = {
            ...validLegacyConfig,
            PORT: undefined,
        };

        const env = validateEnv(configWithoutPort as any);
        expect(env.PORT).toBe(4000);
    });
});
