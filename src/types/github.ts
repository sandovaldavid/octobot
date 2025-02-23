export interface GithubRepository {
    id: number;
    name: string;
    full_name: string;
    description: string | null;
    html_url: string;
    private: boolean;
    language: string | null;
    stargazers_count: number;
    forks_count: number;
    default_branch: string;
    created_at: string;
    updated_at: string;
    topics: string[];
    owner: GithubOwner;
}

export interface GithubOwner {
    login: string;
    id: number;
    type: string;
    avatar_url: string;
}

export interface GithubIssue {
    id: number;
    number: number;
    title: string;
    state: 'open' | 'closed';
    html_url: string;
    body: string;
    user: GithubOwner;
    labels: GithubLabel[];
    created_at: string;
    updated_at: string;
    closed_at: string | null;
}

export interface GithubLabel {
    id: number;
    name: string;
    description: string | null;
    color: string;
}

export interface GithubPullRequest {
    id: number;
    number: number;
    title: string;
    state: 'open' | 'closed' | 'merged';
    body: string;
    user: GithubOwner;
    created_at: string;
    updated_at: string;
    closed_at: string | null;
    merged_at: string | null;
    base: {
        ref: string;
        sha: string;
    };
    head: {
        ref: string;
        sha: string;
    };
}

export interface GithubWebhookPayload {
    action: string;
    repository: GithubRepository;
    sender: GithubOwner;
    issue?: GithubIssue;
    pull_request?: GithubPullRequest;
}

export interface GithubApiResponse<T> {
    success: boolean;
    data?: T;
    total?: number;
    error?: string;
    pagination?: {
        page: number;
        per_page: number;
        hasMore: boolean;
    };
}
