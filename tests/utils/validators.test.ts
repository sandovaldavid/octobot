import { describe, expect, it } from 'bun:test';
import { commonValidators, discordValidators, githubValidators } from '../../src/utils/validators';

describe('Validators Unit Tests', () => {
    describe('githubValidators', () => {
        it('debe validar URLs válidas de repositorios de GitHub', () => {
            expect(githubValidators.isValidRepoUrl('https://github.com/octocat/Hello-World')).toBe(true);
            expect(githubValidators.isValidRepoUrl('http://github.com/user/repo-name.js')).toBe(true);
            expect(githubValidators.isValidRepoUrl('https://gitlab.com/user/repo')).toBe(false);
            expect(githubValidators.isValidRepoUrl('invalid-url')).toBe(false);
        });

        it('debe validar números positivos de issues y PRs', () => {
            expect(githubValidators.isValidIssueNumber(1)).toBe(true);
            expect(githubValidators.isValidIssueNumber(42)).toBe(true);
            expect(githubValidators.isValidIssueNumber(0)).toBe(false);
            expect(githubValidators.isValidIssueNumber(-5)).toBe(false);
            expect(githubValidators.isValidIssueNumber(1.5)).toBe(false);

            expect(githubValidators.isValidPRNumber(10)).toBe(true);
            expect(githubValidators.isValidPRNumber(0)).toBe(false);
        });

        it('debe validar nombres de ramas', () => {
            expect(githubValidators.isValidBranchName('main')).toBe(true);
            expect(githubValidators.isValidBranchName('feature-branch_v1.0')).toBe(true);
        });
    });

    describe('discordValidators', () => {
        it('debe validar IDs de canales y roles de Discord (Snowflakes de 17-19 dígitos)', () => {
            expect(discordValidators.isValidChannelId('123456789012345678')).toBe(true);
            expect(discordValidators.isValidChannelId('1234567890123456789')).toBe(true);
            expect(discordValidators.isValidChannelId('12345')).toBe(false);
            expect(discordValidators.isValidChannelId('abc1234567890123456')).toBe(false);

            expect(discordValidators.isValidRole('123456789012345678')).toBe(true);
        });

        it('debe validar nombres de comandos válidos', () => {
            expect(discordValidators.isValidCommand('ping')).toBe(true);
            expect(discordValidators.isValidCommand('check-webhook')).toBe(true);
            expect(discordValidators.isValidCommand('invalid command')).toBe(false);
        });
    });

    describe('commonValidators', () => {
        it('debe validar URLs generales', () => {
            expect(commonValidators.isValidUrl('https://example.com/api/v1')).toBe(true);
            expect(commonValidators.isValidUrl('http://localhost:3000')).toBe(true);
            expect(commonValidators.isValidUrl('not-a-valid-url')).toBe(false);
        });

        it('debe validar correos electrónicos', () => {
            expect(commonValidators.isValidEmail('user@example.com')).toBe(true);
            expect(commonValidators.isValidEmail('dev.octobot@domain.org')).toBe(true);
            expect(commonValidators.isValidEmail('user@')).toBe(false);
            expect(commonValidators.isValidEmail('invalid-email')).toBe(false);
        });
    });
});
