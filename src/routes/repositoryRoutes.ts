// src/routes/repository.routes.ts
import { Router } from 'express';
import { repositoryController } from '@controllers/repositoyController';

const router = Router();

router.get('/repositories/github', repositoryController.getAllRepositories);
router.post('/repositories/sync', repositoryController.syncRepositories);
router.get('/repositories/stored', repositoryController.getStoredRepositories);
router.post('/repositories', repositoryController.createRepository);

export default router;
