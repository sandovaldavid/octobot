import { Router } from 'express';
import { webhookController } from '@controllers/webhookController';
import { verifyGithubWebhook } from '@/middlewares/verifyGithubWebhook';

const router = Router();

router.post('/github', verifyGithubWebhook, webhookController.handleWebhook);
router.post('/github/test', webhookController.testWebhook);
router.post('/github/repository/:repoName', webhookController.configureRepositoryWebhook);

export default router;
