export interface GitHubInstallationContext {
    installationId: number;
    accountId: number;
    accountLogin: string;
    accountType: 'Organization' | 'User';
    status: 'active' | 'suspended' | 'revoked';
    permissions?: Record<string, string>;
    events?: string[];
}

export type ConnectionAttemptStatus = 'pending_setup' | 'pending_oauth' | 'verifying' | 'consumed' | 'failed';
export type GuildConnectionStatus = 'connected' | 'disconnected';
export type InstallationStatus = 'active' | 'suspended' | 'revoked';
export type RepositorySelection = 'all' | 'selected';
