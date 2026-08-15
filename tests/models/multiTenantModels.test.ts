import { describe, expect, it } from 'bun:test';
import { DiscordGuildConnectionModel } from '../../src/models/discordGuildConnection';
import { GitHubConnectionAttemptModel } from '../../src/models/githubConnectionAttempt';
import { GitHubInstallationModel } from '../../src/models/githubInstallation';
import { RepositorySubscriptionModel, SubscriptionModel } from '../../src/models/subscription';
import { WEBHOOK_EVENTS } from '../../src/types/webhook';

describe('Models - MultiTenant Schemas', () => {
    describe('GitHubInstallationModel', () => {
        it('should define correct schema indexes for GitHubInstallation', () => {
            const indexes = GitHubInstallationModel.schema.indexes();
            const hasUniqueInstallationId = indexes.some((idx) => idx[0].installationId === 1 && idx[1]?.unique);
            expect(hasUniqueInstallationId).toBe(true);
        });

        it('should validate and instantiate a valid GitHubInstallation document', () => {
            const doc = new GitHubInstallationModel({
                installationId: 123456,
                accountId: 7890,
                accountLogin: 'octocat',
                accountType: 'Organization',
                status: 'active',
                repositorySelection: 'selected',
                permissions: { issues: 'read', pull_requests: 'write' },
                events: ['push', 'issues'],
            });

            const validationError = doc.validateSync();
            expect(validationError).toBeUndefined();
            expect(doc.installationId).toBe(123456);
            expect(doc.accountLogin).toBe('octocat');
            expect(doc.status).toBe('active');
            expect(doc.repositorySelection).toBe('selected');
        });

        it('should fail validation if required fields are missing or invalid enum used', () => {
            const invalidDoc = new GitHubInstallationModel({
                accountLogin: 'octocat',
                status: 'invalid_status' as any,
            });

            const error = invalidDoc.validateSync();
            expect(error).toBeDefined();
            expect(error?.errors.installationId).toBeDefined();
            expect(error?.errors.accountId).toBeDefined();
            expect(error?.errors.accountType).toBeDefined();
            expect(error?.errors.status).toBeDefined();
        });
    });

    describe('DiscordGuildConnectionModel', () => {
        it('should define compound unique index on (guildId, installationId) for DiscordGuildConnection', () => {
            const indexes = DiscordGuildConnectionModel.schema.indexes();
            const hasCompoundUnique = indexes.some(
                (idx) => idx[0].guildId === 1 && idx[0].installationId === 1 && idx[1]?.unique
            );
            expect(hasCompoundUnique).toBe(true);
        });

        it('should validate and instantiate a valid DiscordGuildConnection document', () => {
            const doc = new DiscordGuildConnectionModel({
                guildId: '123456789012345678',
                installationId: 123456,
                status: 'connected',
                connectedByDiscordUserId: '987654321098765432',
            });

            const validationError = doc.validateSync();
            expect(validationError).toBeUndefined();
            expect(doc.guildId).toBe('123456789012345678');
            expect(doc.installationId).toBe(123456);
            expect(doc.status).toBe('connected');
        });

        it('should fail validation if required fields are missing', () => {
            const invalidDoc = new DiscordGuildConnectionModel({});
            const error = invalidDoc.validateSync();
            expect(error).toBeDefined();
            expect(error?.errors.guildId).toBeDefined();
            expect(error?.errors.installationId).toBeDefined();
            expect(error?.errors.connectedByDiscordUserId).toBeDefined();
        });
    });

    describe('GitHubConnectionAttemptModel', () => {
        it('should define correct schema indexes including unique installStateHash and TTL index on expiresAt', () => {
            const indexes = GitHubConnectionAttemptModel.schema.indexes();
            const hasUniqueInstallStateHash = indexes.some((idx) => idx[0].installStateHash === 1 && idx[1]?.unique);
            expect(hasUniqueInstallStateHash).toBe(true);

            const hasTtlIndex = indexes.some(
                (idx) => idx[0].expiresAt === 1 && idx[1]?.expireAfterSeconds !== undefined
            );
            expect(hasTtlIndex).toBe(true);
        });

        it('should validate and instantiate a valid GitHubConnectionAttempt document with all states', () => {
            const doc = new GitHubConnectionAttemptModel({
                installStateHash: 'hash-abc-123',
                oauthStateHash: 'oauth-hash-456',
                oauthCodeVerifier: 'verifier-secret-pkce',
                guildId: '123456789012345678',
                initiatedByDiscordUserId: '987654321098765432',
                candidateInstallationId: 123456,
                status: 'pending_setup',
                expiresAt: new Date(Date.now() + 600000),
            });

            const validationError = doc.validateSync();
            expect(validationError).toBeUndefined();
            expect(doc.status).toBe('pending_setup');
            expect(doc.oauthCodeVerifier).toBe('verifier-secret-pkce');
        });

        it('should fail validation if invalid status is passed', () => {
            const invalidDoc = new GitHubConnectionAttemptModel({
                installStateHash: 'hash-abc',
                guildId: '123',
                initiatedByDiscordUserId: '456',
                status: 'invalid_step' as any,
                expiresAt: new Date(),
            });

            const error = invalidDoc.validateSync();
            expect(error).toBeDefined();
            expect(error?.errors.status).toBeDefined();
        });
    });

    describe('SubscriptionModel (Multi-Tenant Updates & Backwards Compatibility)', () => {
        it('should alias SubscriptionModel to RepositorySubscriptionModel', () => {
            expect(SubscriptionModel).toBe(RepositorySubscriptionModel);
        });

        it('should define compound unique and routing indexes for Subscription', () => {
            const indexes = SubscriptionModel.schema.indexes();
            const hasUniqueCompound = indexes.some(
                (idx) =>
                    idx[0].installationId === 1 &&
                    idx[0].repositoryId === 1 &&
                    idx[0].guildId === 1 &&
                    idx[0].channelId === 1 &&
                    idx[1]?.unique
            );
            expect(hasUniqueCompound).toBe(true);

            const hasRoutingIndex = indexes.some(
                (idx) => idx[0].installationId === 1 && idx[0].repositoryId === 1 && idx[0].active === 1
            );
            expect(hasRoutingIndex).toBe(true);
        });

        it('should support multi-tenant fields on SubscriptionModel', () => {
            const doc = new SubscriptionModel({
                repositoryId: 987654,
                repositoryFullName: 'sandovaldavid/octobot',
                installationId: 123456,
                guildId: '123456789012345678',
                channelId: '987654321098765432',
                events: WEBHOOK_EVENTS,
                active: true,
                createdByDiscordUserId: 'admin-user-1',
            });

            const validationError = doc.validateSync();
            expect(validationError).toBeUndefined();
            expect(doc.repositoryId).toBe(987654);
            expect(doc.installationId).toBe(123456);
            expect(doc.createdByDiscordUserId).toBe('admin-user-1');
        });

        it('should maintain backwards compatibility with legacy subscription instances without installationId/repositoryId', () => {
            const legacyDoc = new RepositorySubscriptionModel({
                repositoryFullName: 'sandovaldavid/octobot',
                guildId: '123456789012345678',
                channelId: '987654321098765432',
                events: WEBHOOK_EVENTS,
                active: true,
            });

            const validationError = legacyDoc.validateSync();
            expect(validationError).toBeUndefined();
            expect(legacyDoc.repositoryFullName).toBe('sandovaldavid/octobot');
            expect(legacyDoc.installationId).toBeUndefined();
        });
    });
});
