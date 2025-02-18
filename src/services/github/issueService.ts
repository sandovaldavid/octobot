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
                            number: issue.number,
                            title: issue.title,
                            body: issue.body,
                            state: issue.state,
                            labels: issue.labels.map((label) => ({
                                id: label.id,
                                name: label.name,
                                description: label.description,
                                color: label.color,
                            })),
                            user: {
                                login: issue.user.login,
                                id: issue.user.id,
                                type: issue.user.type,
                                avatar_url: issue.user.avatar_url,
                            },
                            assignee: issue.assignee
                                ? {
                                      login: issue.assignee.login,
                                      id: issue.assignee.id,
                                      type: issue.assignee.type,
                                      avatar_url: issue.assignee.avatar_url,
                                  }
                                : null,
                            repository: {
                                id: issue.repository.id,
                                name: issue.repository.name,
                                full_name: issue.repository.full_name,
                                private: issue.repository.private,
                            },
                            comments: issue.comments,
                            created_at: new Date(issue.created_at),
                            updated_at: new Date(issue.updated_at),
                            closed_at: issue.closed_at ? new Date(issue.closed_at) : null,
                            url: issue.url,
                            html_url: issue.html_url,
                            comments_url: issue.comments_url,
                            locked: issue.locked,
                            milestone: issue.milestone
                                ? {
                                      id: issue.milestone.id,
                                      number: issue.milestone.number,
                                      title: issue.milestone.title,
                                      description: issue.milestone.description,
                                      state: issue.milestone.state,
                                      due_on: new Date(issue.milestone.due_on),
                                  }
                                : null,
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
