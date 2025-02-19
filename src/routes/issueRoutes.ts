import { Router } from 'express';
import { issueController } from '@controllers/issueController';

const router = Router();

router.get('/', issueController.getIssues);
router.get('/:issueNumber', issueController.getIssueById);
router.post('/', issueController.createIssue);
router.post('/sync', issueController.syncIssues);

export default router;
