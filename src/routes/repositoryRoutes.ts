import { Router } from 'express';
import { repositoryController } from '@controllers/repositoyController';

const router = Router();

router.get('/github', repositoryController.getAllRepositories);
router.post('/sync', repositoryController.syncRepositories);
router.get('/stored', repositoryController.getStoredRepositories);
router.post('/', repositoryController.createRepository);
router.patch('/:repoName', repositoryController.updateRepository);
router.delete('/:repoName', repositoryController.deleteRepository);
router.get('/search', repositoryController.searchRepositories);
router.get('/id/:repoId', repositoryController.getRepositoryById);
router.get('/name/:repoName', repositoryController.getRepositoryByName);
router.get('/:repoName/stats', repositoryController.getRepositoryStats);
router.patch('/:repoName/visibility', repositoryController.toggleRepositoryVisibility);
router.patch('/:repoName/topics', repositoryController.updateRepositoryTopics);

export default router;
