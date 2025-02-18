import { Octokit } from 'octokit';
import { debug } from '@utils/logger';

interface GitHubConfig {
    token: string;
    owner: string;
    repo: string;
    baseUrl?: string;
}

class GitHubClient {
    private static instance: GitHubClient;
    private octokit: Octokit;
    private config: GitHubConfig;

    private constructor(config: GitHubConfig) {
        this.config = config;
        this.octokit = new Octokit({
            auth: config.token,
            baseUrl: config.baseUrl || 'https://api.github.com',
        });
        debug.info('GitHub client initialized');
    }

    public static getInstance(config?: GitHubConfig): GitHubClient {
        if (!GitHubClient.instance && config) {
            GitHubClient.instance = new GitHubClient(config);
        }
        return GitHubClient.instance;
    }

    public getOctokit(): Octokit {
        return this.octokit;
    }

    public getConfig(): GitHubConfig {
        return this.config;
    }
}

const defaultConfig: GitHubConfig = {
    token: process.env.GITHUB_TOKEN || '',
    owner: process.env.GITHUB_OWNER || '',
    repo: process.env.GITHUB_REPO || '',
};

export const githubClient = GitHubClient.getInstance(defaultConfig);

export type { GitHubConfig };
