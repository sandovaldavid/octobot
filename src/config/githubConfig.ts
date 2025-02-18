import { Octokit } from 'octokit';
import { debug } from '@utils/logger';
import { webhookService } from '@services/github/webhookService';

interface GitHubConfig {
    token: string;
    owner: string;
    repo: string;
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
            const webhookResult = await webhookService.configureWebhook(this.config.repo);
            if (!webhookResult.success) {
                throw new Error(`Failed to configure webhook: ${webhookResult.error}`);
            }

            const { data: webhooks } = await this.octokit.rest.repos.listWebhooks({
                owner: this.config.owner,
                repo: this.config.repo,
            });

            const webhookUrl = `${process.env.API_URL}/webhooks/github`;
            const webhookExists = webhooks.some((webhook) => webhook.config.url === webhookUrl && webhook.active);

            if (!webhookExists) {
                throw new Error('Webhook not found or inactive');
            }

            debug.info('GitHub webhook configured and active');
            return true;
        } catch (error) {
            debug.error('Webhook connection test failed:', error);
            return false;
        }
    }
}

const defaultConfig: GitHubConfig = {
    token: process.env.GITHUB_TOKEN || '',
    owner: process.env.GITHUB_OWNER || '',
    repo: process.env.GITHUB_REPO || '',
};

export const githubClient = GitHubClient.getInstance(defaultConfig);

export type { GitHubConfig };
