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

            const { data: allIssues } = await octokit.rest.issues.listForAuthenticatedUser({
                filter: 'all',
                state: options.state || 'open',
                labels: options.labels?.join(','),
                since: options.since,
                page: options.page || 1,
                per_page: options.per_page || 100,
                sort: options.sort || 'updated',
                direction: options.direction || 'desc',
            });

            // Filter out pull requests
            const issues = allIssues.filter((issue) => !('pull_request' in issue));

            debug.info(`Retrieved ${issues.length} issues (filtered from ${allIssues.length} total items)`);

            // Update database
            await Promise.all(
                data.map(async (issue) => {
                    const issueData = {
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
                        user: issue.user
                            ? {
                                  login: issue.user.login,
                                  id: issue.user.id,
                                  type: issue.user.type,
                                  avatar_url: issue.user.avatar_url,
                              }
                            : undefined,
                        assignee: issue.assignee
                            ? {
                                  login: issue.assignee.login,
                                  id: issue.assignee.id,
                                  type: issue.assignee.type,
                                  avatar_url: issue.assignee.avatar_url,
                              }
                            : undefined,
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
                            : undefined,
                    };

                    await IssueModel.findOneAndUpdate({ githubId: issue.id }, issueData, { upsert: true, new: true });
                })
            );

            return {
                success: true,
                data: issues,
                total: issues.length,
                pagination: {
                    page: options.page || 1,
                    per_page: options.per_page || 100,
                    hasMore: issues.length === (options.per_page || 100),
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

    async getIssueById(issueNumber: number, repoName?: string): Promise<GithubApiResponse<GithubIssue>> {
        try {
            const octokit = githubClient.getOctokit();
            const config = githubClient.getConfig();
            const repository = repoName || config.repo;

            // Try to find issue in database first with repository context
            const query = {
                number: issueNumber,
                'repository.name': repository,
            };

            const issueFromDb = await IssueModel.findOne(query);

            if (issueFromDb) {
                debug.info(`Retrieved issue #${issueNumber} from database for repository ${repository}`);
                return {
                    success: true,
                    data: issueFromDb,
                };
            }

            try {
                // Verify repository exists first
                await octokit.rest.repos.get({
                    owner: config.owner,
                    repo: repository,
                });

                // Get issue from GitHub API
                const { data: issue } = await octokit.rest.issues.get({
                    owner: config.owner,
                    repo: repository,
                    issue_number: issueNumber,
                });

                // Save to database
                const issueData = {
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
                    user: issue.user && {
                        login: issue.user.login,
                        id: issue.user.id,
                        type: issue.user.type,
                        avatar_url: issue.user.avatar_url,
                    },
                    assignee: issue.assignee && {
                        login: issue.assignee.login,
                        id: issue.assignee.id,
                        type: issue.assignee.type,
                        avatar_url: issue.assignee.avatar_url,
                    },
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
                    milestone: issue.milestone && {
                        id: issue.milestone.id,
                        number: issue.milestone.number,
                        title: issue.milestone.title,
                        description: issue.milestone.description,
                        state: issue.milestone.state,
                        due_on: new Date(issue.milestone.due_on),
                    },
                };

                const savedIssue = await IssueModel.findOneAndUpdate(
                    {
                        number: issueNumber,
                        'repository.name': repository,
                    },
                    issueData,
                    { upsert: true, new: true }
                );

                return {
                    success: true,
                    data: savedIssue,
                };
            } catch (apiError: any) {
                if (apiError.status === 404) {
                    const errorMessage = apiError.message.includes('Not Found')
                        ? `Issue #${issueNumber} not found in repository ${repository}`
                        : `Repository ${repository} not found`;

                    debug.warn(errorMessage);
                    return {
                        success: false,
                        error: errorMessage,
                    };
                }

                if (apiError.status === 403) {
                    debug.warn(`Access denied to repository ${repository}`);
                    return {
                        success: false,
                        error: 'Access denied. Please check your permissions.',
                    };
                }

                throw apiError;
            }
        } catch (error: any) {
            debug.error(`Error in getIssueById:`, {
                issueNumber,
                repository: repoName || config.repo,
                errorType: error.name,
                errorMessage: error.message,
                statusCode: error.status,
            });

            return {
                success: false,
                error: 'Failed to fetch issue. Please try again later.',
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

    async syncIssues(): Promise<GithubApiResponse<{ total: number; synced: number }>> {
        try {
            const octokit = githubClient.getOctokit();
            const config = githubClient.getConfig();

            debug.info('Starting issues synchronization');

            // Get all issues from GitHub (both open and closed)
            const { data: issues } = await octokit.rest.issues.listForAuthenticatedUser({
                filter: 'all',
                state: 'all',
                per_page: 100,
                sort: 'updated',
                direction: 'desc',
            });

            debug.info(`Found ${issues.length} issues to sync`);

            // Update database
            const syncResults = await Promise.all(
                issues.map(async (issue) => {
                    const issueData = {
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
                        user: issue.user && {
                            login: issue.user.login,
                            id: issue.user.id,
                            type: issue.user.type,
                            avatar_url: issue.user.avatar_url,
                        },
                        assignee: issue.assignee && {
                            login: issue.assignee.login,
                            id: issue.assignee.id,
                            type: issue.assignee.type,
                            avatar_url: issue.assignee.avatar_url,
                        },
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
                        milestone: issue.milestone && {
                            id: issue.milestone.id,
                            number: issue.milestone.number,
                            title: issue.milestone.title,
                            description: issue.milestone.description,
                            state: issue.milestone.state,
                            due_on: new Date(issue.milestone.due_on),
                        },
                    };

                    try {
                        await IssueModel.findOneAndUpdate({ githubId: issue.id }, issueData, {
                            upsert: true,
                            new: true,
                        });
                        return true;
                    } catch (error) {
                        debug.error(`Error syncing issue #${issue.number}:`, error);
                        return false;
                    }
                })
            );

            const syncedCount = syncResults.filter(Boolean).length;
            debug.info(`Successfully synced ${syncedCount}/${issues.length} issues`);

            return {
                success: true,
                data: {
                    total: issues.length,
                    synced: syncedCount,
                },
            };
        } catch (error) {
            debug.error('Error syncing issues:', error);
            return {
                success: false,
                error: error.message || 'Failed to sync issues',
            };
        }
    },

    async getIssuesByRepository(
        repoName: string,
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

            debug.info(`Fetching issues for repository: ${repoName}`);

            // Verify repository exists first
            try {
                const { data: repository } = await octokit.rest.repos.get({
                    owner: config.owner,
                    repo: repoName,
                });

                // Get issues from GitHub API
                const { data } = await octokit.rest.issues.listForRepo({
                    owner: config.owner,
                    repo: repoName,
                    state: options.state || 'all',
                    labels: options.labels?.join(','),
                    since: options.since,
                    page: options.page || 1,
                    per_page: options.per_page || 100,
                    sort: options.sort || 'updated',
                    direction: options.direction || 'desc',
                });

                // Update database
                await Promise.all(
                    data.map(async (issue) => {
                        const issueData = {
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
                            user: issue.user && {
                                login: issue.user.login,
                                id: issue.user.id,
                                type: issue.user.type,
                                avatar_url: issue.user.avatar_url,
                            },
                            assignee: issue.assignee && {
                                login: issue.assignee.login,
                                id: issue.assignee.id,
                                type: issue.assignee.type,
                                avatar_url: issue.assignee.avatar_url,
                            },
                            repository: {
                                id: repository.id,
                                name: repository.name,
                                full_name: repository.full_name,
                                private: repository.private,
                            },
                            comments: issue.comments,
                            created_at: new Date(issue.created_at),
                            updated_at: new Date(issue.updated_at),
                            closed_at: issue.closed_at ? new Date(issue.closed_at) : null,
                            url: issue.url,
                            html_url: issue.html_url,
                            comments_url: issue.comments_url,
                            locked: issue.locked,
                            milestone: issue.milestone && {
                                id: issue.milestone.id,
                                number: issue.milestone.number,
                                title: issue.milestone.title,
                                description: issue.milestone.description,
                                state: issue.milestone.state,
                                due_on: new Date(issue.milestone.due_on),
                            },
                        };

                        await IssueModel.findOneAndUpdate(
                            {
                                githubId: issue.id,
                                'repository.name': repoName,
                            },
                            issueData,
                            { upsert: true, new: true }
                        );
                    })
                );

                debug.info(`Retrieved ${data.length} issues for repository ${repoName}`);

                return {
                    success: true,
                    data,
                    total: data.length,
                    pagination: {
                        page: options.page || 1,
                        per_page: options.per_page || 100,
                        hasMore: data.length === (options.per_page || 100),
                    },
                };
            } catch (error: any) {
                if (error.status === 404) {
                    return {
                        success: false,
                        error: `Repository ${repoName} not found`,
                    };
                }
                throw error;
            }
        } catch (error: any) {
            debug.error('Error fetching repository issues:', {
                repository: repoName,
                error: error.message,
                status: error.status,
            });

            return {
                success: false,
                error: error.message || 'Failed to fetch repository issues',
            };
        }
    },
};
