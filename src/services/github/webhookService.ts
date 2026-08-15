import { githubClient } from '@config/githubConfig';
import { debug } from '@utils/logger';
import { GithubApiResponse } from '@/types/github';
import { WEBHOOK_EVENTS, WebhookConfig, WebhookOptions } from '@/types/webhook';
import { RepositorySubscriptionModel } from '@models/subscription';

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

            let owner = config.owner;
            let repo = repoName;

            if (repoName.includes('/')) {
                const parts = repoName.split('/');
                owner = parts[0];
                repo = parts[1];
            }

            try {
                await octokit.rest.repos.get({
                    owner,
                    repo,
                });
            } catch (error) {
                if ((error as any).status === 404) {
                    debug.error(`Repository '${repoName}' does not exist`);
                    return {
                        success: false,
                        error: `Repository '${repoName}' does not exist in account '${owner}'`,
                    };
                }
                throw error;
            }

            const webhookConfig = this.getWebhookConfig(apiUrl);
            const webhookOptions = this.getWebhookOptions(webhookConfig);

            const { data: webhooks } = await octokit.rest.repos.listWebhooks({
                owner,
                repo,
            });

            const existingWebhook = webhooks.find((webhook) => webhook.config.url === webhookConfig.url);

            if (existingWebhook) {
                debug.info(`Webhook already exists for ${owner}/${repo}, updating configuration...`);
                await octokit.rest.repos.updateWebhook({
                    owner,
                    repo,
                    hook_id: existingWebhook.id,
                    ...webhookOptions,
                });
            } else {
                debug.info(`Creating new webhook for ${owner}/${repo}`);
                await octokit.rest.repos.createWebhook({
                    owner,
                    repo,
                    ...webhookOptions,
                });
            }

            debug.info(`Successfully configured webhook for ${owner}/${repo}`);
            return { success: true };
        } catch (error) {
            debug.error('Error configuring webhook:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred while configuring webhook',
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

            let owner = config.owner;
            let repo = repoName;

            if (repoName.includes('/')) {
                const parts = repoName.split('/');
                owner = parts[0];
                repo = parts[1];
            }

            const webhookUrl = new URL('/api/webhooks/github', apiUrl).toString();

            const { data: webhooks } = await octokit.rest.repos.listWebhooks({
                owner,
                repo,
            });

            const existingWebhook = webhooks.find((webhook) => webhook.config.url === webhookUrl);

            if (!existingWebhook) {
                return {
                    success: true,
                    error: 'No webhook found to remove',
                };
            }

            await octokit.rest.repos.deleteWebhook({
                owner,
                repo,
                hook_id: existingWebhook.id,
            });

            debug.info(`Successfully removed webhook for ${owner}/${repo}`);
            return { success: true };
        } catch (error) {
            debug.error('Error removing webhook:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred while removing webhook',
            };
        }
    }

    public async checkWebhook(
        repoName: string
    ): Promise<GithubApiResponse<{ exists: boolean; active?: boolean; channelId?: string }>> {
        try {
            const octokit = githubClient.getOctokit();
            const config = githubClient.getConfig();
            const apiUrl = process.env.API_URL;

            if (!apiUrl) {
                debug.error('API_URL not configured');
                return {
                    success: false,
                    error: 'API_URL is not defined in environment variables',
                };
            }

            let owner = config.owner;
            let repo = repoName;

            if (repoName.includes('/')) {
                const parts = repoName.split('/');
                owner = parts[0];
                repo = parts[1];
            }

            try {
                await octokit.rest.repos.get({
                    owner,
                    repo,
                });
            } catch (error) {
                if ((error as any).status === 404) {
                    const errorMsg = `Repository '${repoName}' does not exist in account '${owner}'`;
                    debug.warn(errorMsg);
                    return {
                        success: false,
                        error: errorMsg,
                    };
                }
                throw error;
            }

            const webhookUrl = new URL('/api/webhooks/github', apiUrl).toString();

            const { data: webhooks } = await octokit.rest.repos
                .listWebhooks({
                    owner,
                    repo,
                })
                .catch((error) => {
                    debug.error(`Error listing webhooks: ${error.message}`);
                    throw error;
                });

            const webhook = webhooks.find((hook) => hook.config.url === webhookUrl);

            if (!webhook) {
                debug.info(`No webhook found for repository ${repoName}`);
                return {
                    success: true,
                    data: {
                        exists: false,
                    },
                };
            }

            // Check active subscription from database
            const subscription = await RepositorySubscriptionModel.findOne({
                repositoryFullName: repoName.toLowerCase(),
                active: true,
            });

            debug.info(
                `Webhook found for ${repoName} - Active: ${webhook.active}, Channel: ${subscription?.channelId || 'Not set'}`
            );
            return {
                success: true,
                data: {
                    exists: true,
                    active: webhook.active,
                    channelId: subscription?.channelId,
                },
            };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Failed to check webhook status';
            debug.error('Error checking webhook:', errorMsg);
            return {
                success: false,
                error: errorMsg,
            };
        }
    }
}

export const webhookService = WebhookService.getInstance();
