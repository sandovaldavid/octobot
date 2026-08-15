import { Router } from 'express';
import { webhookController } from '@controllers/webhookController';
import { verifyGithubWebhook } from '@/middlewares/verifyGithubWebhook';

const router = Router();

router.post('/github', verifyGithubWebhook, webhookController.handleWebhook);

export default router;
