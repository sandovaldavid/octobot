import { Request, Response } from 'express';
import { repositoryService } from '@services/github/repositoryService';
import { RepositoryModel } from '@models/repository';
import { debug } from '@utils/logger';
import { GithubRepository, GithubApiResponse } from '@types/githubTypes';
import { logger } from '../utils/logger';

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

    async updateRepository(req: Request, res: Response) {
        try {
            const { repoName } = req.params;
            const { name, description, private: isPrivate, topics, default_branch } = req.body;

            const result = await repositoryService.updateRepository(repoName, {
                name,
                description,
                private: isPrivate,
                topics,
                default_branch,
            });

            if (result.success) {
                res.json(result);
            } else {
                res.status(400).json(result);
            }
        } catch (error) {
            debug.error('Error in updateRepository controller:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    async deleteRepository(req: Request, res: Response) {
        try {
            const { repoName } = req.params;

            const githubResult = await repositoryService.deleteRepository(repoName);

            if (!githubResult.success) {
                return res.status(400).json({
                    success: false,
                    error: githubResult.error,
                });
            }

            try {
                await RepositoryModel.deleteOne({ name: repoName });
                debug.info(`Database: Deleted repository ${repoName}`);
            } catch (dbError) {
                debug.error('Database Error:', dbError);
                return res.status(500).json({
                    success: false,
                    error: 'Repository deleted from GitHub but database update failed',
                });
            }

            return res.status(200).json({
                success: true,
                message: `Repository ${repoName} successfully deleted`,
            });
        } catch (error) {
            debug.error('Controller Error:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal Server Error',
            });
        }
    },

    async getRepositoryById(req: Request, res: Response) {
        try {
            const { repoId } = req.params;
            const repository = await RepositoryModel.findOne({ githubId: repoId });

            if (!repository) {
                return res.status(404).json({
                    success: false,
                    error: 'Repository not found',
                });
            }

            res.json({
                success: true,
                data: repository,
            });
        } catch (error) {
            debug.error('Error in getRepositoryById controller:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    async getRepositoryByName(req: Request, res: Response) {
        try {
            const { repoName } = req.params;
            const repository = await RepositoryModel.findOne({ name: repoName });

            if (!repository) {
                return res.status(404).json({
                    success: false,
                    error: 'Repository not found',
                });
            }

            res.json({
                success: true,
                data: repository,
            });
        } catch (error) {
            debug.error('Error in getRepositoryByName controller:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    async getRepositoryStats(req: Request, res: Response) {
        try {
            const { repoName } = req.params;
            const result = await repositoryService.getRepositoryStats(repoName);

            if (!result.success) {
                return res.status(400).json(result);
            }

            res.json(result);
        } catch (error) {
            debug.error('Error in getRepositoryStats controller:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    async toggleRepositoryVisibility(req: Request, res: Response) {
        try {
            const { repoName } = req.params;
            const repository = await RepositoryModel.findOne({ name: repoName });

            if (!repository) {
                return res.status(404).json({
                    success: false,
                    error: 'Repository not found',
                });
            }

            const result = await repositoryService.updateRepository(repoName, {
                private: !repository.isPrivate,
            });

            if (result.success) {
                res.json(result);
            } else {
                res.status(400).json(result);
            }
        } catch (error) {
            debug.error('Error in toggleRepositoryVisibility controller:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    async searchRepositories(req: Request, res: Response) {
        try {
            const { query, language, sort = 'updated' } = req.query;
            const repositories = await RepositoryModel.find({
                $or: [{ name: { $regex: query, $options: 'i' } }, { description: { $regex: query, $options: 'i' } }],
                ...(language && { language }),
            }).sort({ [sort]: -1 });

            res.json({
                success: true,
                total: repositories.length,
                data: repositories,
            });
        } catch (error) {
            debug.error('Error in searchRepositories controller:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    async updateRepositoryTopics(req: Request, res: Response) {
        try {
            const { repoName } = req.params;
            const { topics } = req.body;

            if (!Array.isArray(topics)) {
                return res.status(400).json({
                    success: false,
                    error: 'Topics must be an array of strings',
                });
            }

            const result = await repositoryService.updateRepository(repoName, { topics });

            if (result.success) {
                res.json(result);
            } else {
                res.status(400).json(result);
            }
        } catch (error) {
            debug.error('Error in updateRepositoryTopics controller:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },
};
