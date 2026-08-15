import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { debug } from '@utils/logger';

export function verifyGithubWebhook(req: Request, res: Response, next: NextFunction): void {
    const event = req.headers['x-github-event'] as string;
    const signature = req.headers['x-hub-signature-256'] as string;
    const secret = process.env.GITHUB_WEBHOOK_SECRET;

    if (!secret) {
        debug.error('GITHUB_WEBHOOK_SECRET not configured');
        res.status(500).json({ success: false, error: 'Webhook secret not configured' });
        return;
    }

    if (!event) {
        res.status(400).json({ success: false, error: 'No GitHub event specified' });
        return;
    }

    // Skip signature verification for ping events during webhook setup
    if (event === 'ping') {
        res.status(200).json({ success: true, message: 'Webhook ping received' });
        return;
    }

    if (!signature) {
        debug.warn('Rejected webhook request: Missing x-hub-signature-256 header');
        res.status(401).json({ success: false, error: 'Missing signature header' });
        return;
    }

    try {
        const rawPayload = (req as any).rawBody || Buffer.from(JSON.stringify(req.body));
        const signatureValue = signature.replace('sha256=', '');

        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(rawPayload);
        const calculatedSignature = hmac.digest('hex');

        const sigBuf = Buffer.from(signatureValue, 'utf8');
        const calcBuf = Buffer.from(calculatedSignature, 'utf8');

        const isValid = sigBuf.length === calcBuf.length && crypto.timingSafeEqual(sigBuf, calcBuf);

        if (!isValid) {
            debug.error('Invalid GitHub webhook signature', {
                expected: calculatedSignature,
                received: signatureValue,
            });
            res.status(401).json({ success: false, error: 'Invalid webhook signature' });
            return;
        }

        debug.info('GitHub webhook signature verified successfully');
        next();
    } catch (error) {
        debug.error('Error verifying webhook signature:', error);
        res.status(401).json({ success: false, error: 'Invalid signature format' });
    }
}
