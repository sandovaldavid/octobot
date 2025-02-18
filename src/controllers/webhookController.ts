import { Request, Response } from 'express';
import { handleGithubWebhook, handleRepositoryWebhook } from '@webhooks/handler';
import { debug } from '@utils/logger';
import { RepositoryModel } from '@models/repository';
import { webhookService } from '@services/github/webhookService';

export const webhookController = {
    async handleWebhook(req: Request, res: Response) {
        try {
            const event = req.headers['x-github-event'] as string;
            const signature = req.headers['x-hub-signature-256'] as string;

            if (!event) {
                return res.status(400).json({
                    success: false,
                    error: 'No GitHub event specified',
                });
            }

            await handleGithubWebhook(event, req.body);
            res.status(200).json({
                success: true,
                message: 'Webhook processed successfully',
            });
        } catch (error) {
            debug.error('Webhook processing error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to process webhook',
            });
        }
    },

    async testWebhook(req: Request, res: Response) {
        try {
            const testPayload = {
                repository: {
                    id: 123,
                    name: 'test-repo',
                    full_name: 'user/test-repo',
                    private: false,
                    html_url: 'https://github.com/user/test-repo',
                },
                sender: {
                    login: 'test-user',
                    avatar_url: 'https://github.com/user.png',
                },
                commits: [
                    {
                        id: 'abc123',
                        message: 'Test commit message',
                        author: {
                            name: 'Test User',
                            email: 'test@example.com',
                        },
                    },
                ],
                ref: 'refs/heads/main',
                compare: 'https://github.com/user/test-repo/compare/123...456',
            };

            await handleGithubWebhook('push', testPayload);
            res.json({
                success: true,
                message: 'Test webhook processed successfully',
            });
        } catch (error) {
            debug.error('Test webhook error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to process test webhook',
            });
        }
    },

    async configureRepositoryWebhook(req: Request, res: Response) {
        try {
            const { repoName } = req.params;

            if (!repoName) {
                return res.status(400).json({
                    success: false,
                    error: 'Repository name is required',
                });
            }

            const result = await handleRepositoryWebhook(repoName);
            res.json(result);
        } catch (error) {
            debug.error('Repository webhook configuration error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to configure repository webhook',
            });
        }
    },
};
