import { githubClient } from '@config/githubConfig';
import { debug } from '@utils/logger';
import { GithubApiResponse } from '@types/githubTypes';
import { WEBHOOK_EVENTS, WebhookConfig, WebhookOptions } from '@types/webhookTypes';

export class WebhookService {
    private static instance: WebhookService;

    private constructor() {}

    public static getInstance(): WebhookService {
        if (!WebhookService.instance) {
            WebhookService.instance = new WebhookService();
        }
        return WebhookService.instance;
    }

    private getWebhookConfig(apiUrl: string): WebhookConfig {
        return {
            url: new URL('/api/webhooks/github', apiUrl).toString(),
            content_type: 'json',
            secret: process.env.GITHUB_WEBHOOK_SECRET || '',
            insecure_ssl: '0',
        };
    }

    private getWebhookOptions(config: WebhookConfig): WebhookOptions {
        return {
            config,
            events: [...WEBHOOK_EVENTS],
            active: true,
        };
    }

    public async configureWebhook(repoName: string): Promise<GithubApiResponse<void>> {
        try {
            const octokit = githubClient.getOctokit();
            const config = githubClient.getConfig();
            const apiUrl = process.env.API_URL;

            if (!apiUrl) {
                throw new Error('API_URL is not defined in environment variables');
            }

            try {
                await octokit.rest.repos.get({
                    owner: config.owner,
                    repo: repoName,
                });
            } catch (error) {
                if (error.status === 404) {
                    debug.error(`Repository '${repoName}' does not exist`);
                    return {
                        success: false,
                        error: `Repository '${repoName}' does not exist in ${config.owner}'s account`,
                    };
                }
                throw error;
            }

            const webhookConfig = this.getWebhookConfig(apiUrl);
            const webhookOptions = this.getWebhookOptions(webhookConfig);

            const { data: webhooks } = await octokit.rest.repos.listWebhooks({
                owner: config.owner,
                repo: repoName,
            });

            const existingWebhook = webhooks.find((webhook) => webhook.config.url === webhookConfig.url);

            if (existingWebhook) {
                debug.info(`Webhook already exists for ${repoName}, updating configuration...`);
                await octokit.rest.repos.updateWebhook({
                    owner: config.owner,
                    repo: repoName,
                    hook_id: existingWebhook.id,
                    ...webhookOptions,
                });
            } else {
                debug.info(`Creating new webhook for ${repoName}`);
                await octokit.rest.repos.createWebhook({
                    owner: config.owner,
                    repo: repoName,
                    ...webhookOptions,
                });
            }

            debug.info(`Successfully configured webhook for ${repoName}`);
            return { success: true };
        } catch (error) {
            debug.error('Error configuring webhook:', error);
            return {
                success: false,
                error: error.message || 'Unknown error occurred while configuring webhook',
            };
        }
    }

    public async removeWebhook(repoName: string): Promise<GithubApiResponse<void>> {
        try {
            const octokit = githubClient.getOctokit();
            const config = githubClient.getConfig();
            const apiUrl = process.env.API_URL;

            if (!apiUrl) {
                throw new Error('API_URL is not defined in environment variables');
            }

            const webhookUrl = new URL('/api/webhooks/github', apiUrl).toString();

            // Find existing webhook
            const { data: webhooks } = await octokit.rest.repos.listWebhooks({
                owner: config.owner,
                repo: repoName,
            });

            const existingWebhook = webhooks.find((webhook) => webhook.config.url === webhookUrl);

            if (!existingWebhook) {
                return {
                    success: true,
                    message: 'No webhook found to remove',
                };
            }

            // Remove webhook
            await octokit.rest.repos.deleteWebhook({
                owner: config.owner,
                repo: repoName,
                hook_id: existingWebhook.id,
            });

            debug.info(`Successfully removed webhook for ${repoName}`);
            return { success: true };
        } catch (error) {
            debug.error('Error removing webhook:', error);
            return {
                success: false,
                error: error.message || 'Unknown error occurred while removing webhook',
            };
        }
    }
}

export const webhookService = WebhookService.getInstance();
