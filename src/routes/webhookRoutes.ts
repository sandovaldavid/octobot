import { Router } from 'express';
import { webhookController } from '@controllers/webhookController';

const router = Router();

router.post('/github', webhookController.handleWebhook);
router.post('/github/test', webhookController.testWebhook);
router.post('/github/repository/:repoName', webhookController.configureRepositoryWebhook);

export default router;
