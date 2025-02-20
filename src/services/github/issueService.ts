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
            repo?: string;
        } = {}
    ): Promise<GithubApiResponse<GithubIssue[]>> {
        try {
            const octokit = githubClient.getOctokit();
            const config = githubClient.getConfig();
            let allIssues: any[] = [];

            if (options.repo) {
                // Add repository information to issues
                const repoInfo = await octokit.rest.repos.get({
                    owner: config.owner,
                    repo: options.repo,
                });

                if (options.state === 'all') {
                    const [openIssues, closedIssues] = await Promise.all([
                        octokit.rest.issues.listForRepo({
                            owner: config.owner,
                            repo: options.repo,
                            state: 'open',
                            per_page: 100,
                            sort: options.sort || 'updated',
                            direction: options.direction || 'desc',
                        }),
                        octokit.rest.issues.listForRepo({
                            owner: config.owner,
                            repo: options.repo,
                            state: 'closed',
                            per_page: 100,
                            sort: options.sort || 'updated',
                            direction: options.direction || 'desc',
                        }),
                    ]);

                    // Combine and add repository information
                    allIssues = [...openIssues.data, ...closedIssues.data].map((issue) => ({
                        ...issue,
                        repository: {
                            id: repoInfo.data.id,
                            name: repoInfo.data.name,
                            full_name: repoInfo.data.full_name,
                            private: repoInfo.data.private,
                        },
                    }));
                } else {
                    const { data } = await octokit.rest.issues.listForRepo({
                        owner: config.owner,
                        repo: options.repo,
                        state: options.state || 'open',
                        per_page: 100,
                        sort: options.sort || 'updated',
                        direction: options.direction || 'desc',
                    });

                    // Add repository information
                    allIssues = data.map((issue) => ({
                        ...issue,
                        repository: {
                            id: repoInfo.data.id,
                            name: repoInfo.data.name,
                            full_name: repoInfo.data.full_name,
                            private: repoInfo.data.private,
                        },
                    }));
                }
            } else {
                // Get all issues for authenticated user
                const { data } = await octokit.rest.issues.listForAuthenticatedUser({
                    filter: 'all',
                    state: options.state || 'open',
                    labels: options.labels?.join(','),
                    since: options.since,
                    per_page: 100,
                    sort: options.sort || 'updated',
                    direction: options.direction || 'desc',
                });
                allIssues = data;
            }

            // Filter out pull requests
            const filteredIssues = allIssues.filter((issue) => !('pull_request' in issue));
            debug.info(`Filtered to ${filteredIssues.length} issues (excluding pull requests)`);

            // Handle pagination
            const page = options.page || 1;
            const perPage = options.per_page || 10;
            const startIndex = (page - 1) * perPage;
            const endIndex = startIndex + perPage;
            const paginatedIssues = filteredIssues.slice(startIndex, endIndex);

            return {
                success: true,
                data: paginatedIssues,
                total: filteredIssues.length,
                pagination: {
                    page,
                    per_page: perPage,
                    hasMore: endIndex < filteredIssues.length,
                },
            };
        } catch (error: any) {
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
            debug.info('Starting issues synchronization');

            // Use getIssues function to get filtered issues (no pull requests)
            const result = await this.getIssues({
                state: 'all',
                per_page: 100,
                sort: 'updated',
                direction: 'desc',
            });

            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch issues');
            }

            const issues = result.data;
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
            debug.info(`Fetching issues for repository: ${repoName}`);

            // Use getIssues with repo parameter
            const result = await this.getIssues({
                ...options,
                repo: repoName,
            });

            if (!result.success) {
                debug.warn(`Failed to fetch issues for repository ${repoName}: ${result.error}`);
                return result;
            }

            debug.info(`Retrieved ${result.data.length} issues for repository ${repoName}`);

            return {
                success: true,
                data: result.data,
                total: result.total,
                pagination: {
                    page: options.page || 1,
                    per_page: options.per_page || 100,
                    hasMore: result.pagination?.hasMore || false,
                },
            };
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
