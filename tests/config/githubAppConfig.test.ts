import { describe, expect, it } from 'bun:test';
import { getGitHubAppConfig, validateGitHubAppEnv } from '../../src/config/githubAppConfig';

describe('Config - GitHubAppConfig', () => {
    const validEnv = {
        GITHUB_APP_ID: '123456',
        GITHUB_APP_PRIVATE_KEY: '-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----',
        GITHUB_WEBHOOK_SECRET: 'test_webhook_secret',
        GITHUB_CLIENT_ID: 'Iv1.test_client_id',
        GITHUB_CLIENT_SECRET: 'test_client_secret',
    };

    it('should parse valid GitHub App environment variables', () => {
        const config = validateGitHubAppEnv(validEnv);
        expect(config.appId).toBe(123456);
        expect(config.privateKey).toBe('-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----');
        expect(config.webhookSecret).toBe('test_webhook_secret');
        expect(config.clientId).toBe('Iv1.test_client_id');
        expect(config.clientSecret).toBe('test_client_secret');
    });

    it('should handle escaped newlines in private key', () => {
        const envWithEscapedNewlines = {
            ...validEnv,
            GITHUB_APP_PRIVATE_KEY: '-----BEGIN RSA PRIVATE KEY-----\\nline1\\nline2\\n-----END RSA PRIVATE KEY-----',
        };
        const config = validateGitHubAppEnv(envWithEscapedNewlines);
        expect(config.privateKey).toBe('-----BEGIN RSA PRIVATE KEY-----\nline1\nline2\n-----END RSA PRIVATE KEY-----');
    });

    it('should throw if GITHUB_APP_ID is missing or not a number', () => {
        expect(() => validateGitHubAppEnv({ ...validEnv, GITHUB_APP_ID: undefined } as any)).toThrow(/GITHUB_APP_ID/);
        expect(() => validateGitHubAppEnv({ ...validEnv, GITHUB_APP_ID: 'abc' } as any)).toThrow(/GITHUB_APP_ID/);
        expect(() => validateGitHubAppEnv({ ...validEnv, GITHUB_APP_ID: '' } as any)).toThrow(/GITHUB_APP_ID/);
    });

    it('should throw if GITHUB_APP_PRIVATE_KEY is missing or invalid', () => {
        expect(() => validateGitHubAppEnv({ ...validEnv, GITHUB_APP_PRIVATE_KEY: undefined } as any)).toThrow(
            /GITHUB_APP_PRIVATE_KEY/
        );
        expect(() => validateGitHubAppEnv({ ...validEnv, GITHUB_APP_PRIVATE_KEY: 'invalid-key' } as any)).toThrow(
            /GITHUB_APP_PRIVATE_KEY/
        );
    });

    it('should throw if GITHUB_WEBHOOK_SECRET is missing', () => {
        expect(() => validateGitHubAppEnv({ ...validEnv, GITHUB_WEBHOOK_SECRET: undefined } as any)).toThrow(
            /GITHUB_WEBHOOK_SECRET/
        );
    });

    it('should throw if GITHUB_CLIENT_ID is missing', () => {
        expect(() => validateGitHubAppEnv({ ...validEnv, GITHUB_CLIENT_ID: undefined } as any)).toThrow(
            /GITHUB_CLIENT_ID/
        );
    });

    it('should throw if GITHUB_CLIENT_SECRET is missing', () => {
        expect(() => validateGitHubAppEnv({ ...validEnv, GITHUB_CLIENT_SECRET: undefined } as any)).toThrow(
            /GITHUB_CLIENT_SECRET/
        );
    });

    it('should return cached config from getGitHubAppConfig after successful validation', () => {
        const origEnv = { ...process.env };
        try {
            process.env.GITHUB_APP_ID = '987654';
            process.env.GITHUB_APP_PRIVATE_KEY = '-----BEGIN RSA PRIVATE KEY-----\nkey\n-----END RSA PRIVATE KEY-----';
            process.env.GITHUB_WEBHOOK_SECRET = 'webhook_secret';
            process.env.GITHUB_CLIENT_ID = 'client_id';
            process.env.GITHUB_CLIENT_SECRET = 'client_secret';

            const config = getGitHubAppConfig();
            expect(config.appId).toBe(987654);
            expect(config.clientId).toBe('client_id');
        } finally {
            process.env = origEnv;
        }
    });
});
