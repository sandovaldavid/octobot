import { Router } from 'express';
import { webhookController } from '@controllers/webhookController';

const router = Router();

router.post('/webhooks/github', webhookController.handleWebhook);
router.post('/webhooks/github/test', webhookController.testWebhook);
router.post('/webhooks/github/repository/:repoName', webhookController.configureRepositoryWebhook);

export default router;
