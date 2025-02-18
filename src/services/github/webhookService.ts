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

            const webhookUrl = new URL('/webhooks/github', apiUrl).toString();
            const webhookConfig = {
                url: webhookUrl,
                content_type: 'json',
                secret: process.env.GITHUB_WEBHOOK_SECRET,
                insecure_ssl: process.env.NODE_ENV === 'development' ? '1' : '0',
            };

            const events = ['push', 'pull_request', 'issues', 'release', 'create', 'delete'];

            // List existing webhooks
            const { data: existingWebhooks } = await octokit.rest.repos.listWebhooks({
                owner: config.owner,
                repo: repoName,
            });

            // Find webhook with matching URL
            const existingWebhook = existingWebhooks.find((webhook) => webhook.config.url === webhookUrl);

            if (existingWebhook) {
                // Delete existing webhook if configuration is different
                const needsUpdate =
                    existingWebhook.config.content_type !== webhookConfig.content_type ||
                    existingWebhook.config.insecure_ssl !== webhookConfig.insecure_ssl ||
                    !existingWebhook.active ||
                    JSON.stringify(existingWebhook.events.sort()) !== JSON.stringify(events.sort());

                if (needsUpdate) {
                    await octokit.rest.repos.deleteWebhook({
                        owner: config.owner,
                        repo: repoName,
                        hook_id: existingWebhook.id,
                    });

                    debug.info(`Deleted existing webhook for ${repoName} to reconfigure`);
                } else {
                    debug.info(`Webhook already properly configured for ${repoName}`);
                    return { success: true };
                }
            }

            // Create new webhook
            await octokit.rest.repos.createWebhook({
                owner: config.owner,
                repo: repoName,
                config: webhookConfig,
                events,
                active: true,
            });

            debug.info(`Successfully configured webhook for ${repoName} at ${webhookUrl}`);
            return { success: true };
        } catch (error) {
            debug.error('Error configuring webhook:', error);
            return {
                success: false,
                error: error.message,
            };
        }
    },
};
