import { githubClient } from '@config/github.config';
import { debug } from '@utils/logger';

export const githubService = {
    async getIssues(state: 'open' | 'closed' | 'all' = 'open') {
        try {
            const octokit = githubClient.getOctokit();
            const config = githubClient.getConfig();

            const { data } = await octokit.rest.issues.listForRepo({
                owner: config.owner,
                repo: config.repo,
                state,
                per_page: 100,
                sort: 'updated',
                direction: 'desc',
            });

            debug.info(`Retrieved ${data.length} issues from ${config.owner}/${config.repo}`);
            return data;
        } catch (error) {
            debug.error('Error fetching issues:', error);
            throw error;
        }
    },

    async getIssueById(issueNumber: number) {
        try {
            const octokit = githubClient.getOctokit();
            const config = githubClient.getConfig();

            const { data } = await octokit.rest.issues.get({
                owner: config.owner,
                repo: config.repo,
                issue_number: issueNumber,
            });

            debug.info(`Retrieved issue #${issueNumber}`);
            return data;
        } catch (error) {
            debug.error(`Error fetching issue #${issueNumber}:`, error);
            throw error;
        }
    },

    async createIssue(title: string, body: string, labels?: string[]) {
        try {
            const octokit = githubClient.getOctokit();
            const config = githubClient.getConfig();

            const { data } = await octokit.rest.issues.create({
                owner: config.owner,
                repo: config.repo,
                title,
                body,
                labels,
            });

            debug.info(`Created new issue: ${title}`);
            return data;
        } catch (error) {
            debug.error('Error creating issue:', error);
            throw error;
        }
    },
};
