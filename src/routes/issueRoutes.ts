import { Router } from 'express';
import { getIssues, getIssuesByRepository, getIssueById, createIssue, syncIssues } from '@controllers/issueController';

const router = Router();

router.get('/', getIssues);
router.get('/repository/:repoName', getIssuesByRepository);
router.get('/:issueNumber', getIssueById);
router.post('/', createIssue);
router.post('/sync', syncIssues);

export default router;
