import { githubClient } from '@config/githubConfig';
import { debug } from '@utils/logger';
import { RepositoryModel } from '@models/repository';
import { GithubRepository, GithubApiResponse } from '@types/githubTypes';

interface CreateRepositoryOptions {
    name: string;
    description?: string;
    private?: boolean;
    autoInit?: boolean;
    gitignoreTemplate?: string;
    licenseTemplate?: string;
    topics?: string[];
}

interface RepositoryResponse<T> extends GithubApiResponse<T> {
    total?: number;
}

export const repositoryService = {
    async testConnection(): Promise<GithubApiResponse<GithubRepository>> {
        try {
            const { data } = await this.getRepository();
            debug.info(`Successfully connected to GitHub repository: ${data.full_name}`);
            return {
                success: true,
                data: this.mapRepositoryData(data),
            };
        } catch (error) {
            debug.error('Error connecting to GitHub:', error);
            return { success: false, error: error.message };
        }
    },

    async getAllRepositories(): Promise<RepositoryResponse<GithubRepository[]>> {
        try {
            const octokit = githubClient.getOctokit();
            const config = githubClient.getConfig();

            const { data } = await octokit.rest.repos.listForUser({
                username: config.owner,
                type: 'owner',
                sort: 'updated',
                direction: 'desc',
                per_page: 100,
            });

            debug.info(`Retrieved ${data.length} repositories for user ${config.owner}`);
            return {
                success: true,
                total: data.length,
                data: data.map(this.mapRepositoryData),
            };
        } catch (error) {
            debug.error('Error fetching repositories:', error);
            return { success: false, error: error.message };
        }
    },

    async getRepository() {
        const octokit = githubClient.getOctokit();
        const config = githubClient.getConfig();

        return await octokit.rest.repos.get({
            owner: config.owner,
            repo: config.repo,
        });
    },

    async syncRepositories(): Promise<RepositoryResponse<GithubRepository[]>> {
        try {
            const { success, data } = await this.getAllRepositories();
            if (!success || !data) {
                throw new Error('Failed to fetch repositories');
            }

            const result = await Promise.all(
                data.map(async (repo) => {
                    const repositoryData = {
                        githubId: repo.id,
                        name: repo.name,
                        fullName: repo.full_name,
                        description: repo.description || '',
                        url: repo.html_url,
                        isPrivate: repo.private,
                        language: repo.language,
                        stars: repo.stargazers_count,
                        forks: repo.forks_count,
                        defaultBranch: repo.default_branch,
                        createdAt: new Date(repo.created_at),
                        updatedAt: new Date(repo.updated_at),
                        topics: repo.topics,
                        owner: {
                            login: repo.owner.login,
                            id: repo.owner.id,
                            type: repo.owner.type,
                            avatar_url: repo.owner.avatar_url,
                        },
                    };

                    return await RepositoryModel.findOneAndUpdate({ githubId: repo.id }, repositoryData, {
                        upsert: true,
                        new: true,
                    });
                })
            );

            debug.info(`Synchronized ${result.length} repositories to database`);
            return {
                success: true,
                total: result.length,
                data: result,
            };
        } catch (error) {
            debug.error('Error syncing repositories:', error);
            return { success: false, error: error.message };
        }
    },

    async getStoredRepositories(): Promise<RepositoryResponse<GithubRepository[]>> {
        try {
            const repositories = await RepositoryModel.find().sort({ updatedAt: -1 });
            return {
                success: true,
                data: repositories,
                total: repositories.length,
            };
        } catch (error) {
            debug.error('Error getting stored repositories:', error);
            return { success: false, error: error.message };
        }
    },

    async createRepository(options: CreateRepositoryOptions): Promise<GithubApiResponse<GithubRepository>> {
        try {
            const octokit = githubClient.getOctokit();
            const config = githubClient.getConfig();

            const { data } = await octokit.rest.repos.createForAuthenticatedUser({
                name: options.name,
                description: options.description,
                private: options.private,
                auto_init: options.autoInit,
                gitignore_template: options.gitignoreTemplate,
                license_template: options.licenseTemplate,
            });

            debug.info(`Created new repository: ${data.full_name}`);

            if (options.topics && options.topics.length > 0) {
                await octokit.rest.repos.replaceAllTopics({
                    owner: data.owner.login,
                    repo: data.name,
                    names: options.topics,
                });
                debug.info(`Added topics to repository: ${options.topics.join(', ')}`);
            }

            const { data: updatedRepo } = await octokit.rest.repos.get({
                owner: data.owner.login,
                repo: data.name,
            });

            const repositoryData = {
                githubId: updatedRepo.id,
                name: updatedRepo.name,
                fullName: updatedRepo.full_name,
                description: updatedRepo.description || '',
                url: updatedRepo.html_url,
                isPrivate: updatedRepo.private,
                language: updatedRepo.language,
                stars: updatedRepo.stargazers_count,
                forks: updatedRepo.forks_count,
                defaultBranch: updatedRepo.default_branch,
                createdAt: new Date(updatedRepo.created_at),
                updatedAt: new Date(updatedRepo.updated_at),
                topics: updatedRepo.topics || options.topics || [],
                owner: {
                    login: updatedRepo.owner.login,
                    id: updatedRepo.owner.id,
                    type: updatedRepo.owner.type,
                    avatar_url: updatedRepo.owner.avatar_url,
                },
            };

            const savedRepo = await RepositoryModel.create(repositoryData);

            return {
                success: true,
                data: this.mapRepositoryData(updatedRepo),
            };
        } catch (error) {
            debug.error('Error creating repository:', error);
            return { success: false, error: error.message };
        }
    },

    mapRepositoryData(repo: any): GithubRepository {
        return {
            id: repo.id,
            name: repo.name,
            full_name: repo.full_name,
            description: repo.description || '',
            html_url: repo.html_url,
            private: repo.private,
            language: repo.language,
            stargazers_count: repo.stargazers_count,
            forks_count: repo.forks_count,
            default_branch: repo.default_branch,
            created_at: repo.created_at,
            updated_at: repo.updated_at,
            topics: repo.topics || [],
            owner: {
                login: repo.owner.login,
                id: repo.owner.id,
                type: repo.owner.type,
                avatar_url: repo.owner.avatar_url,
            },
        };
    },
};
