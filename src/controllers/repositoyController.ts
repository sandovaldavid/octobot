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
            const result = await repositoryService.getStoredRepositories();
            res.json(result);
        } catch (error) {
            debug.error('Error in getStoredRepositories controller:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    async createRepository(req: Request, res: Response) {
        try {
            const {
                name,
                description,
                private: isPrivate,
                autoInit,
                gitignoreTemplate,
                licenseTemplate,
                topics,
            } = req.body;

            if (!name) {
                return res.status(400).json({
                    success: false,
                    error: 'Repository name is required',
                });
            }

            if (topics && !Array.isArray(topics)) {
                return res.status(400).json({
                    success: false,
                    error: 'Topics must be an array of strings',
                });
            }

            const result = await repositoryService.createRepository({
                name,
                description,
                private: isPrivate,
                autoInit,
                gitignoreTemplate,
                licenseTemplate,
                topics,
            });

            if (result.success) {
                res.status(201).json(result);
            } else {
                res.status(400).json(result);
            }
        } catch (error) {
            debug.error('Error in createRepository controller:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },
};
