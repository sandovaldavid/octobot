import { Router } from 'express';
import { repositoryController } from '@controllers/repositoyController';

const router = Router();

router.get('/repositories/github', repositoryController.getAllRepositories);
router.post('/repositories/sync', repositoryController.syncRepositories);
router.get('/repositories/stored', repositoryController.getStoredRepositories);
router.post('/repositories', repositoryController.createRepository);
router.patch('/repositories/:repoName', repositoryController.updateRepository);
router.delete('/repositories/:repoName', repositoryController.deleteRepository);
router.get('/repositories/search', repositoryController.searchRepositories);
router.get('/repositories/id/:repoId', repositoryController.getRepositoryById);
router.get('/repositories/name/:repoName', repositoryController.getRepositoryByName);
router.get('/repositories/:repoName/stats', repositoryController.getRepositoryStats);
router.patch('/repositories/:repoName/visibility', repositoryController.toggleRepositoryVisibility);
router.patch('/repositories/:repoName/topics', repositoryController.updateRepositoryTopics);

export default router;
