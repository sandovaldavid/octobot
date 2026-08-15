import { Octokit } from 'octokit';
import { debug } from '@utils/logger';
import { webhookService } from '@services/github/webhookService';

interface GitHubConfig {
    token: string;
    owner: string;
    repo?: string;
    baseUrl?: string;
}

class GitHubClient {
    private static instance: GitHubClient;
    private octokit: Octokit;
    private config: GitHubConfig;

    private constructor(config: GitHubConfig) {
        this.config = config;
        this.octokit = new Octokit({
            auth: config.token,
            baseUrl: config.baseUrl || 'https://api.github.com',
        });
        debug.info('GitHub client initialized');
    }

    public static getInstance(config?: GitHubConfig): GitHubClient {
        if (!GitHubClient.instance && config) {
            GitHubClient.instance = new GitHubClient(config);
        }
        return GitHubClient.instance;
    }

    public getOctokit(): Octokit {
        return this.octokit;
    }

    public getConfig(): GitHubConfig {
        return this.config;
    }

    public async testWebhookConnection(): Promise<boolean> {
        try {
            // Verify GitHub Token authenticity & connectivity
            const { data: user } = await this.octokit.rest.users.getAuthenticated();
            debug.info(`GitHub authenticated as: ${user.login}`);

            // If a specific default repo is provided in env, verify its webhook
            if (this.config.repo) {
                const webhookResult = await webhookService.configureWebhook(this.config.repo);
                if (!webhookResult.success) {
                    debug.warn(`Failed to configure default repo webhook: ${webhookResult.error}`);
                }
            }

            return true;
        } catch (error) {
            debug.error('GitHub connection test failed:', error);
            return false;
        }
    }
}

const defaultConfig: GitHubConfig = {
    token: process.env.GITHUB_TOKEN || '',
    owner: process.env.GITHUB_OWNER || '',
    repo: process.env.GITHUB_REPO,
};

export const githubClient = GitHubClient.getInstance(defaultConfig);

export type { GitHubConfig };
