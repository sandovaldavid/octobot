import { Router } from 'express';
import { issueController } from '@controllers/issue.controller';

const router = Router();

router.get('/issues', issueController.getIssues);
router.get('/issues/:issueNumber', issueController.getIssueById);
router.post('/issues', issueController.createIssue);

export default router;
