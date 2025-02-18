import { Request, Response } from 'express';
import { repositoryService } from '@services/github/repositoryService';
import { RepositoryModel } from '@models/repository';
import { debug } from '@utils/logger';
import { GithubRepository, GithubApiResponse } from '@types/githubTypes';

export const repositoryController = {
    async getAllRepositories(req: Request, res: Response) {
        try {
            const result: GithubApiResponse<GithubRepository[]> = await repositoryService.getAllRepositories();
            res.json(result);
        } catch (error) {
            debug.error('Error in getAllRepositories controller:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    async syncRepositories(req: Request, res: Response) {
        try {
            const result = await repositoryService.syncRepositories();
            res.json(result);
        } catch (error) {
            debug.error('Error in syncRepositories controller:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    async getStoredRepositories(req: Request, res: Response) {
        try {
            const repositories = await RepositoryModel.find().sort({ updatedAt: -1 });
            res.json({ success: true, data: repositories });
        } catch (error) {
            debug.error('Error in getStoredRepositories controller:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },
};
