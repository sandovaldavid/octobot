import { githubClient } from '@config/githubConfig';
import { debug } from '@utils/logger';
import { GithubIssue, GithubApiResponse } from '@/types/github';

export interface GetIssuesOptions {
    repo: string;
    state?: 'open' | 'closed' | 'all';
    page?: number;
    per_page?: number;
    sort?: 'created' | 'updated' | 'comments';
    direction?: 'asc' | 'desc';
}

export interface LiveIssuesResult {
    issues: GithubIssue[];
    page: number;
    per_page: number;
    hasNext: boolean;
    hasPrevious: boolean;
}

export const issueService = {
    async getIssues(options: GetIssuesOptions): Promise<GithubApiResponse<LiveIssuesResult>> {
        try {
            const octokit = githubClient.getOctokit();
            const config = githubClient.getConfig();
            const page = options.page || 1;
            const perPage = options.per_page || 5;
            const state = options.state || 'open';

            let owner = config.owner;
            let repo = options.repo;

            if (options.repo.includes('/')) {
                const parts = options.repo.split('/');
                owner = parts[0];
                repo = parts[1];
            }

            debug.info(
                `Fetching live GitHub issues for ${owner}/${repo} (state: ${state}, page: ${page}, per_page: ${perPage})`
            );

            const { data } = await octokit.rest.issues.listForRepo({
                owner,
                repo,
                state,
                page,
                per_page: perPage + 1,
                sort: options.sort || 'updated',
                direction: options.direction || 'desc',
            });

            // Filter out Pull Requests (GitHub Issues API includes PRs unless filtered)
            const rawIssues = data.filter((issue: any) => !issue.pull_request);
            const hasNext = rawIssues.length > perPage;
            const issuesToReturn = rawIssues.slice(0, perPage);

            const mappedIssues: GithubIssue[] = issuesToReturn.map((issue: any) => ({
                id: issue.id,
                number: issue.number,
                title: issue.title,
                body: issue.body || '',
                state: issue.state as 'open' | 'closed',
                html_url: issue.html_url,
                user: {
                    login: issue.user?.login || 'ghost',
                    id: issue.user?.id || 0,
                    type: issue.user?.type || 'User',
                    avatar_url: issue.user?.avatar_url || '',
                },
                labels: (issue.labels || []).map((label: any) =>
                    typeof label === 'string'
                        ? { id: 0, name: label, color: '' }
                        : { id: label.id || 0, name: label.name || '', color: label.color || '' }
                ),
                assignee: issue.assignee
                    ? {
                          login: issue.assignee.login,
                          id: issue.assignee.id,
                          avatar_url: issue.assignee.avatar_url,
                      }
                    : null,
                created_at: issue.created_at,
                updated_at: issue.updated_at,
                closed_at: issue.closed_at,
            }));

            return {
                success: true,
                data: {
                    issues: mappedIssues,
                    page,
                    per_page: perPage,
                    hasNext,
                    hasPrevious: page > 1,
                },
            };
        } catch (error) {
            debug.error('Error fetching live GitHub issues:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred while fetching issues',
            };
        }
    },
};
