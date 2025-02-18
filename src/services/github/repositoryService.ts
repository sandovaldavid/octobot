import { githubClient } from '@config/githubConfig';
import { debug } from '@utils/logger';
import { RepositoryModel } from '@models/repository';
import { GithubRepository, GithubApiResponse } from '@types/githubTypes';

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

    async getAllRepositories(): Promise<GithubApiResponse<GithubRepository[]>> {
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
