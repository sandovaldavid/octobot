import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { debug } from '@utils/logger';

export function verifyGithubWebhook(req: Request, res: Response, next: NextFunction): void {
    const event = req.headers['x-github-event'] as string;
    const deliveryId = req.headers['x-github-delivery'] as string;
    const signature = req.headers['x-hub-signature-256'] as string;
    const secret = process.env.GITHUB_WEBHOOK_SECRET;

    if (!secret) {
        debug.error('GITHUB_WEBHOOK_SECRET not configured');
        res.status(500).json({ success: false, error: 'Webhook secret not configured' });
        return;
    }

    if (!event) {
        res.status(400).json({ success: false, error: 'Missing x-github-event header' });
        return;
    }

    if (!deliveryId) {
        res.status(400).json({ success: false, error: 'Missing x-github-delivery header' });
        return;
    }

    const rawPayload: Buffer | undefined = (req as any).rawBody;
    if (!rawPayload || !Buffer.isBuffer(rawPayload)) {
        debug.warn('Rejected webhook request: Missing raw request body for verification');
        res.status(400).json({ success: false, error: 'Missing raw request body for verification' });
        return;
    }

    if (!signature) {
        debug.warn(`Rejected webhook request ${deliveryId}: Missing x-hub-signature-256 header`);
        res.status(401).json({ success: false, error: 'Missing signature header' });
        return;
    }

    try {
        const signatureValue = signature.replace('sha256=', '');
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(rawPayload);
        const calculatedSignature = hmac.digest('hex');

        const sigBuf = Buffer.from(signatureValue, 'utf8');
        const calcBuf = Buffer.from(calculatedSignature, 'utf8');

        const isValid = sigBuf.length === calcBuf.length && crypto.timingSafeEqual(sigBuf, calcBuf);

        if (!isValid) {
            debug.warn(`Invalid GitHub webhook signature for delivery ${deliveryId}`);
            res.status(401).json({ success: false, error: 'Invalid webhook signature' });
            return;
        }

        debug.info(`GitHub webhook signature verified for delivery ${deliveryId} (event: ${event})`);
        next();
    } catch (error) {
        debug.error('Error verifying webhook signature:', error);
        res.status(401).json({ success: false, error: 'Invalid signature format' });
    }
}
