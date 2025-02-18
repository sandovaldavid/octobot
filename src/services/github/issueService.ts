import { githubClient } from '@config/githubConfig';
import { debug } from '@utils/logger';
import { GithubIssue, GithubApiResponse } from '@types/githubTypes';
import { IssueModel } from '@models/issue';

export const issueService = {
    async getIssues(
        options: {
            state?: 'open' | 'closed' | 'all';
            labels?: string[];
            since?: string;
            page?: number;
            per_page?: number;
            sort?: 'created' | 'updated' | 'comments';
            direction?: 'asc' | 'desc';
        } = {}
    ): Promise<GithubApiResponse<GithubIssue[]>> {
        try {
            const octokit = githubClient.getOctokit();
            const config = githubClient.getConfig();

            const {
                state = 'open',
                labels,
                since,
                page = 1,
                per_page = 100,
                sort = 'updated',
                direction = 'desc',
            } = options;

            const { data } = await octokit.rest.issues.listForAuthenticatedUser({
                filter: 'all', // can be 'assigned', 'created', 'mentioned', 'subscribed'
                state,
                labels: labels?.join(','),
                since,
                page,
                per_page,
                sort,
                direction,
            });

            await Promise.all(
                data.map(async (issue) => {
                    await IssueModel.findOneAndUpdate(
                        { githubId: issue.id },
                        {
                            githubId: issue.id,
                            title: issue.title,
                            body: issue.body,
                            state: issue.state,
                            labels: issue.labels.map((label) => label.name),
                            createdAt: new Date(issue.created_at),
                            updatedAt: new Date(issue.updated_at),
                            assignee: issue.assignee?.login,
                            repository: issue.repository?.full_name || 'unknown',
                        },
                        { upsert: true, new: true }
                    );
                })
            );

            debug.info(`Retrieved ${data.length} issues for user ${config.owner}`);
            return {
                success: true,
                data,
                total: data.length,
                pagination: {
                    page,
                    per_page,
                    hasMore: data.length === per_page,
                },
            };
        } catch (error) {
            debug.error('Error fetching issues:', error);
            return {
                success: false,
                error: error.message,
            };
        }
    },

    async getIssueById(issueNumber: number): Promise<GithubApiResponse<GithubIssue>> {
        try {
            const octokit = githubClient.getOctokit();
            const config = githubClient.getConfig();

            const { data } = await octokit.rest.issues.get({
                owner: config.owner,
                repo: config.repo,
                issue_number: issueNumber,
            });

            debug.info(`Retrieved issue #${issueNumber}`);
            return {
                success: true,
                data,
            };
        } catch (error) {
            debug.error(`Error fetching issue #${issueNumber}:`, error);
            return {
                success: false,
                error: error.message,
            };
        }
    },

    async createIssue(title: string, body: string, labels?: string[]): Promise<GithubApiResponse<GithubIssue>> {
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
            return {
                success: true,
                data,
            };
        } catch (error) {
            debug.error('Error creating issue:', error);
            return {
                success: false,
                error: error.message,
            };
        }
    },
};
