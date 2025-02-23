import { Request, Response } from 'express';
import crypto from 'crypto';
import { handleGithubWebhook, handleRepositoryWebhook } from '@webhooks/handler';
import { debug } from '@utils/logger';

export const webhookController = {
    async handleWebhook(req: Request, res: Response): Promise<void> {
        try {
            const event = req.headers['x-github-event'] as string;
            const signature = req.headers['x-hub-signature-256'] as string;
            const rawBody = JSON.stringify(req.body);

            debug.info(`Received webhook event: ${event}`);

            // Verify webhook signature
            const secret = process.env.GITHUB_WEBHOOK_SECRET;
            if (!secret) {
                debug.error('GITHUB_WEBHOOK_SECRET not configured');
                res.status(500).json({
                    success: false,
                    error: 'Webhook secret not configured',
                });
            }

            // Skip signature verification for ping events during webhook setup
            if (event === 'ping') {
                debug.info('Processing ping event - skipping signature verification');
                res.status(200).json({
                    success: true,
                    message: 'Webhook ping received',
                });
            }

            if (signature) {
                try {
                    // Extract signature value without prefix
                    const signatureValue = signature.replace('sha256=', '');

                    // Calculate expected signature
                    const hmac = crypto.createHmac('sha256', secret!);
                    hmac.update(rawBody);
                    const calculatedSignature = hmac.digest('hex');

                    // Use timing-safe comparison
                    const isValid = crypto.timingSafeEqual(
                        Buffer.from(signatureValue),
                        Buffer.from(calculatedSignature)
                    );

                    if (!isValid) {
                        debug.error('Invalid webhook signature', {
                            expected: calculatedSignature,
                            received: signatureValue,
                        });
                        res.status(401).json({
                            success: false,
                            error: 'Invalid webhook signature',
                        });
                    }

                    debug.info('Webhook signature verified successfully');
                } catch (error) {
                    debug.error('Error verifying webhook signature:', error);
                    res.status(401).json({
                        success: false,
                        error: 'Invalid signature format',
                    });
                }
            } else {
                debug.warn('No signature provided in webhook request');
                res.status(401).json({
                    success: false,
                    error: 'Missing signature header',
                });
            }

            if (!event) {
                res.status(400).json({
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

    async testWebhook(req: Request, res: Response): Promise<void> {
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

    async configureRepositoryWebhook(req: Request, res: Response): Promise<void> {
        try {
            const { repoName } = req.params;

            if (!repoName) {
                res.status(400).json({
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
