export class GuildNotConnectedError extends Error {
    constructor(public readonly guildId: string) {
        super(`Discord guild ${guildId} is not connected to any GitHub installation.`);
        this.name = 'GuildNotConnectedError';
    }
}

export class InstallationNotFoundError extends Error {
    constructor(public readonly installationId: number) {
        super(`GitHub installation ${installationId} was not found.`);
        this.name = 'InstallationNotFoundError';
    }
}

export class InstallationSuspendedError extends Error {
    constructor(public readonly installationId: number) {
        super(`GitHub installation ${installationId} is currently suspended.`);
        this.name = 'InstallationSuspendedError';
    }
}

export class InstallationRevokedError extends Error {
    constructor(public readonly installationId: number) {
        super(`GitHub installation ${installationId} was uninstalled or revoked.`);
        this.name = 'InstallationRevokedError';
    }
}

export class RepositoryNotAccessibleError extends Error {
    constructor(
        public readonly repositoryFullName: string,
        public readonly installationId: number
    ) {
        super(`Repository ${repositoryFullName} is not accessible under GitHub installation ${installationId}.`);
        this.name = 'RepositoryNotAccessibleError';
    }
}

export class MissingCommandPermissionError extends Error {
    constructor(public readonly requiredPermission: string) {
        super(`User lacks required permission: ${requiredPermission}`);
        this.name = 'MissingCommandPermissionError';
    }
}

export class HandshakeExpiredError extends Error {
    constructor() {
        super('The connection handshake request expired or has already been used.');
        this.name = 'HandshakeExpiredError';
    }
}

export class InstallationVerificationError extends Error {
    constructor(
        public readonly discordUserId: string,
        public readonly installationId: number
    ) {
        super(`The GitHub installation ${installationId} could not be verified for user ${discordUserId}.`);
        this.name = 'InstallationVerificationError';
    }
}

export function toUserFacingErrorMessage(error: unknown): string {
    if (error instanceof GuildNotConnectedError) {
        return '⚠️ This Discord server is not connected to GitHub. Run `/gh connect` to link your organization.';
    }
    if (error instanceof InstallationSuspendedError) {
        return '⏸️ The GitHub installation for this server is suspended on GitHub. Please check your GitHub settings.';
    }
    if (error instanceof InstallationRevokedError) {
        return '❌ The GitHub installation was uninstalled. Please reconnect using `/gh connect`.';
    }
    if (error instanceof RepositoryNotAccessibleError) {
        return `🔒 OctoBot does not have access to **${error.repositoryFullName}** under your GitHub App installation. Please configure repository access in GitHub.`;
    }
    if (error instanceof MissingCommandPermissionError) {
        return '🚫 You need **Manage Server** permissions to configure OctoBot integrations.';
    }
    if (error instanceof HandshakeExpiredError) {
        return '⌛ Connection request expired or was already consumed. Please run `/gh connect` again.';
    }
    if (error instanceof InstallationVerificationError) {
        return '❌ The GitHub installation could not be verified for the authenticated GitHub user.';
    }
    return '❌ An unexpected error occurred while communicating with GitHub.';
}
