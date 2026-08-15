import { describe, expect, it } from 'bun:test';
import {
    GuildNotConnectedError,
    HandshakeExpiredError,
    InstallationNotFoundError,
    InstallationRevokedError,
    InstallationSuspendedError,
    InstallationVerificationError,
    MissingCommandPermissionError,
    RepositoryNotAccessibleError,
    toUserFacingErrorMessage,
} from '../../src/types/multiTenantErrors';

describe('Types - MultiTenantErrors', () => {
    it('should correctly instantiate domain errors with proper properties and names', () => {
        const guildErr = new GuildNotConnectedError('guild-123');
        expect(guildErr.name).toBe('GuildNotConnectedError');
        expect(guildErr.guildId).toBe('guild-123');
        expect(guildErr.message).toContain('guild-123');

        const notFoundErr = new InstallationNotFoundError(1001);
        expect(notFoundErr.name).toBe('InstallationNotFoundError');
        expect(notFoundErr.installationId).toBe(1001);
        expect(notFoundErr.message).toContain('1001');

        const suspendedErr = new InstallationSuspendedError(1002);
        expect(suspendedErr.name).toBe('InstallationSuspendedError');
        expect(suspendedErr.installationId).toBe(1002);
        expect(suspendedErr.message).toContain('1002');

        const revokedErr = new InstallationRevokedError(1003);
        expect(revokedErr.name).toBe('InstallationRevokedError');
        expect(revokedErr.installationId).toBe(1003);
        expect(revokedErr.message).toContain('1003');

        const repoErr = new RepositoryNotAccessibleError('owner/repo', 1004);
        expect(repoErr.name).toBe('RepositoryNotAccessibleError');
        expect(repoErr.repositoryFullName).toBe('owner/repo');
        expect(repoErr.installationId).toBe(1004);
        expect(repoErr.message).toContain('owner/repo');

        const permErr = new MissingCommandPermissionError('ManageGuild');
        expect(permErr.name).toBe('MissingCommandPermissionError');
        expect(permErr.requiredPermission).toBe('ManageGuild');
        expect(permErr.message).toContain('ManageGuild');

        const handshakeErr = new HandshakeExpiredError();
        expect(handshakeErr.name).toBe('HandshakeExpiredError');
        expect(handshakeErr.message).toBeDefined();

        const verifyErr = new InstallationVerificationError('user-1', 1005);
        expect(verifyErr.name).toBe('InstallationVerificationError');
        expect(verifyErr.discordUserId).toBe('user-1');
        expect(verifyErr.installationId).toBe(1005);
        expect(verifyErr.message).toContain('user-1');
    });

    it('should format domain errors into safe user-facing Discord messages', () => {
        const err1 = new GuildNotConnectedError('guild-123');
        expect(toUserFacingErrorMessage(err1)).toContain('/gh connect');

        const err2 = new InstallationSuspendedError(1001);
        expect(toUserFacingErrorMessage(err2)).toContain('suspended');

        const err3 = new InstallationRevokedError(1001);
        expect(toUserFacingErrorMessage(err3)).toContain('uninstalled');

        const err4 = new RepositoryNotAccessibleError('owner/repo', 1001);
        expect(toUserFacingErrorMessage(err4)).toContain('owner/repo');

        const err5 = new MissingCommandPermissionError('ManageGuild');
        expect(toUserFacingErrorMessage(err5)).toContain('Manage Server');

        const err6 = new HandshakeExpiredError();
        expect(toUserFacingErrorMessage(err6)).toContain('/gh connect');

        const err7 = new InstallationVerificationError('user-1', 1001);
        expect(toUserFacingErrorMessage(err7)).toContain('could not be verified');

        const genericErr = new Error('Database connection failed');
        expect(toUserFacingErrorMessage(genericErr)).toBe(
            '❌ An unexpected error occurred while communicating with GitHub.'
        );

        expect(toUserFacingErrorMessage(undefined)).toBe(
            '❌ An unexpected error occurred while communicating with GitHub.'
        );
    });
});
