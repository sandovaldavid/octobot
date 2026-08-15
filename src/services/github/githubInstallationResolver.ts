import { DiscordGuildConnectionModel } from '../../models/discordGuildConnection';
import { GitHubInstallationModel, IGitHubInstallation } from '../../models/githubInstallation';
import { GitHubInstallationContext } from '../../types/githubApp';
import {
    GuildNotConnectedError,
    InstallationRevokedError,
    InstallationSuspendedError,
} from '../../types/multiTenantErrors';

export interface IGitHubInstallationResolver {
    resolveForGuild(guildId: string, repositoryFullName?: string): Promise<GitHubInstallationContext>;
    listForGuild(guildId: string): Promise<GitHubInstallationContext[]>;
}

export class GitHubInstallationResolver implements IGitHubInstallationResolver {
    async resolveForGuild(guildId: string, repositoryFullName?: string): Promise<GitHubInstallationContext> {
        const connections = await DiscordGuildConnectionModel.find({ guildId, status: 'connected' }).lean();
        if (!connections || connections.length === 0) {
            throw new GuildNotConnectedError(guildId);
        }

        if (connections.length === 1) {
            const installationId = connections[0].installationId;
            const installation = await GitHubInstallationModel.findOne({ installationId }).lean();
            return this.validateAndFormatInstallation(installation, installationId);
        }

        const installationIds = connections.map((c) => c.installationId);
        const installations = await GitHubInstallationModel.find({
            installationId: { $in: installationIds },
        }).lean();

        if (repositoryFullName) {
            const ownerLogin = repositoryFullName.split('/')[0].toLowerCase().trim();
            const matched = installations.find((inst) => inst.accountLogin?.toLowerCase() === ownerLogin);
            if (matched) {
                return this.validateAndFormatInstallation(matched, matched.installationId);
            }
        }

        const defaultConnection = connections[0];
        const defaultInstallation = installations.find(
            (inst) => inst.installationId === defaultConnection.installationId
        );
        return this.validateAndFormatInstallation(defaultInstallation, defaultConnection.installationId);
    }

    async listForGuild(guildId: string): Promise<GitHubInstallationContext[]> {
        const connections = await DiscordGuildConnectionModel.find({ guildId, status: 'connected' }).lean();
        if (!connections || connections.length === 0) {
            return [];
        }

        const installationIds = connections.map((c) => c.installationId);
        const installations = await GitHubInstallationModel.find({
            installationId: { $in: installationIds },
        }).lean();

        return installations
            .filter((inst) => inst.status === 'active')
            .map((inst) => this.formatInstallationContext(inst));
    }

    private validateAndFormatInstallation(
        installation: IGitHubInstallation | null | undefined,
        installationId: number
    ): GitHubInstallationContext {
        if (!installation || installation.status === 'revoked') {
            throw new InstallationRevokedError(installationId);
        }

        if (installation.status === 'suspended') {
            throw new InstallationSuspendedError(installationId);
        }

        return this.formatInstallationContext(installation);
    }

    private formatInstallationContext(installation: IGitHubInstallation): GitHubInstallationContext {
        return {
            installationId: installation.installationId,
            accountId: installation.accountId,
            accountLogin: installation.accountLogin,
            accountType: installation.accountType,
            status: installation.status,
            permissions:
                installation.permissions instanceof Map
                    ? Object.fromEntries(installation.permissions)
                    : (installation.permissions as Record<string, string> | undefined),
            events: installation.events,
        };
    }
}
