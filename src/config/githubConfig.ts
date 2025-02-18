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
                debug.warn(`Failed to configure webhook: ${webhookResult.error}`);
            }

            const { data: webhooks } = await this.octokit.rest.repos.listWebhooks({
                owner: this.config.owner,
                repo: this.config.repo,
            });

            const webhookUrl = new URL('/api/webhooks/github', process.env.API_URL).toString();
            const webhookExists = webhooks.some((webhook) => {
                const isMatchingUrl = webhook.config.url === webhookUrl;
                const isActive = webhook.active;
                const hasCorrectEvents = webhook.events.includes('push');

                debug.info('Webhook validation:', {
                    url: webhook.config.url,
                    expectedUrl: webhookUrl,
                    isActive,
                    events: webhook.events,
                });

                return isMatchingUrl && isActive && hasCorrectEvents;
            });

            if (!webhookExists) {
                debug.info('Webhook not found, attempting to create...');
                const createResult = await webhookService.configureWebhook(this.config.repo);
                if (!createResult.success) {
                    throw new Error(`Failed to create webhook: ${createResult.error}`);
                }
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
