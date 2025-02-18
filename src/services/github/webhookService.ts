import { githubClient } from '@config/githubConfig';
import { debug } from '@utils/logger';
import { GithubApiResponse } from '@types/githubTypes';

export const webhookService = {
    async configureWebhook(repoName: string): Promise<GithubApiResponse<void>> {
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

            const webhookUrl = new URL('/api/webhooks/github', apiUrl).toString();
            const webhookConfig = {
                url: webhookUrl,
                content_type: 'json',
                secret: process.env.GITHUB_WEBHOOK_SECRET,
                insecure_ssl: '0',
            };

            const { data: webhooks } = await octokit.rest.repos.listWebhooks({
                owner: config.owner,
                repo: repoName,
            });

            const existingWebhook = webhooks.find((webhook) => webhook.config.url === webhookUrl);

            if (existingWebhook) {
                debug.info(`Webhook already exists for ${repoName}, updating configuration...`);
                await octokit.rest.repos.updateWebhook({
                    owner: config.owner,
                    repo: repoName,
                    hook_id: existingWebhook.id,
                    config: webhookConfig,
                    events: ['push', 'pull_request', 'issues', 'release', 'create', 'delete'],
                    active: true,
                });
            } else {
                debug.info(`Creating new webhook for ${repoName}`);
                await octokit.rest.repos.createWebhook({
                    owner: config.owner,
                    repo: repoName,
                    config: webhookConfig,
                    events: ['push', 'pull_request', 'issues', 'release', 'create', 'delete'],
                    active: true,
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
    },
};
