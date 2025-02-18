import { Router } from 'express';
import { webhookController } from '@controllers/webhookController';

const router = Router();

router.post('/webhooks/github', webhookController.handleWebhook);
router.post('/webhooks/github/test', webhookController.testWebhook);

export default router;
