import { Request, Response } from 'express';
import { issueService } from '@services/github/issueService';
import { IssueModel } from '@models/issue';
import { debug } from '@utils/logger';
import { CommandConfig } from '@config/commandConfig';
import { RepositoryModel } from '@models/repository';
import { isValidationError } from '@/types/error';

interface QueryParams {
    state?: 'open' | 'closed' | 'all';
    labels?: string[];
    since?: string;
    page?: number;
    per_page?: number;
    sort?: string;
    direction?: 'asc' | 'desc';
    repository?: string;
}

type SortOrder = 'asc' | 'desc';

const validateQueryParams = (params: QueryParams): boolean => {
    if (params.state && !['open', 'closed', 'all'].includes(params.state)) {
        return false;
    }
    return true;
};

export const buildQuery = (params: QueryParams): any => {
    const query: any = {};

    if (params.state !== 'all') {
        query.state = params.state;
    }
    if (params.labels) {
        query['labels.name'] = {
            $in: Array.isArray(params.labels) ? params.labels : (params.labels as string).split(','),
        };
    }
    if (params.repository) {
        query['repository.name'] = params.repository;
    }
    if (params.since) {
        query.updated_at = { $gte: new Date(params.since) };
    }

    return query;
};

export const getIssues = async (req: Request, res: Response): Promise<void> => {
    try {
        const params: QueryParams = {
            state: (req.query.state as 'open' | 'closed' | 'all') || 'all',
            labels: req.query.labels as string[],
            since: req.query.since as string,
            page: Number(req.query.page) || 1,
            per_page: Number(req.query.per_page) || 50,
            sort: (req.query.sort as string) || 'updated_at',
            direction: (req.query.direction as 'asc' | 'desc') || 'desc',
            repository: req.query.repository as string,
        };

        if (!validateQueryParams(params)) {
            res.status(400).json({
                success: false,
                error: 'Invalid query parameters',
            });
        }

        const query = buildQuery(params);
        const skip = ((params.page ?? 1) - 1) * (params.per_page || 50);
        const sortOption: [string, SortOrder][] = [
            [params.sort as string, params.direction === 'desc' ? 'desc' : 'asc'],
        ];

        const [issues, total] = await Promise.all([
            IssueModel.find(query)
                .sort(sortOption)
                .skip(skip)
                .limit(params.per_page || 50)
                .lean(),
            IssueModel.countDocuments(query),
        ]);

        debug.info(`Retrieved ${issues.length} issues from database`);

        res.json({
            success: true,
            data: issues,
            total,
            pagination: {
                page: params.page,
                per_page: params.per_page,
                total_pages: Math.ceil(total / (params.per_page || 50)),
                has_more: skip + issues.length < total,
            },
        });
    } catch (error) {
        debug.error('Error in getIssues controller:', error);
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
        });
    }
};

export const getIssueById = async (req: Request, res: Response): Promise<void> => {
    try {
        const { issueNumber } = req.params;
        const { repo } = req.query;

        if (!issueNumber || isNaN(Number(issueNumber))) {
            res.status(400).json({
                success: false,
                error: 'Invalid issue number',
            });
        }

        const issue = await issueService.getIssueById(Number(issueNumber), repo as string);

        if (!issue.success) {
            res.status(404).json(issue);
        }

        res.json(issue);
    } catch (error) {
        debug.error('Error in getIssueById controller:', error);
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
        });
    }
};

export const createIssue = async (req: Request, res: Response): Promise<void> => {
    try {
        const { title, body, labels } = req.body;
        const issue = await issueService.createIssue(title, body, labels);
        res.status(201).json(issue);
    } catch (error) {
        debug.error('Error in createIssue controller:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const syncIssues = async (req: Request, res: Response): Promise<void> => {
    try {
        debug.info('Starting issues synchronization');

        const repositories = await RepositoryModel.find({}, { name: 1 }).lean();

        if (!repositories.length) {
            debug.warn('No repositories found in database');
            res.status(400).json({
                success: false,
                error: 'No repositories found in database. Please sync repositories first using /github repo sync',
            });
        }

        const syncResult = await issueService.syncIssues();

        if (!syncResult.success) {
            debug.error('Failed to sync issues:', syncResult.error);
            res.status(400).json({
                success: false,
                error: syncResult.error || 'Failed to sync issues. Please try again later.',
            });
        }

        const { total, synced } = syncResult.data;

        debug.info('Sync completed:', {
            totalIssues: total,
            syncedIssues: synced,
            repositories: repositories.length,
        });

        res.json({
            success: true,
            data: {
                total,
                synced,
                repositories: repositories.length,
                message: `Successfully synchronized ${synced} out of ${total} issues from ${repositories.length} repositories`,
            },
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        debug.error('Error in syncIssues controller:', error);

        if (error instanceof Error && error.name === 'ValidationError') {
            res.status(400).json({
                success: false,
                error: 'Invalid data format',
                details: (error as Error).message,
            });
        }

        if ((error as any).code === 11000) {
            res.status(409).json({
                success: false,
                error: 'Duplicate issue detected',
                details: (error as Error).message,
            });
        }

        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'Failed to synchronize issues. Please try again later.',
        });
    }
};

export const getIssuesByRepository = async (req: Request, res: Response): Promise<void> => {
    try {
        const { repoName } = req.params;

        if (!repoName) {
            res.status(400).json({
                success: false,
                error: 'Repository name is required',
            });
        }

        const repository = await RepositoryModel.findOne({ name: repoName });
        if (!repository) {
            debug.warn(`Repository ${repoName} not found in database`);
            res.status(404).json({
                success: false,
                error: `Repository '${repoName}' not found. Please sync repositories first using /github repo sync`,
            });
        }

        const queryParams = parseQueryParams(req.query);
        if (!validateQueryParams(queryParams)) {
            res.status(400).json({
                success: false,
                error: 'Invalid query parameters',
                details: 'Please check state, sort, and direction values',
            });
        }

        const result = await issueService.getIssuesByRepository(repoName, {
            state: queryParams.state,
            labels: queryParams.labels,
            since: queryParams.since,
            page: queryParams.page,
            per_page: queryParams.per_page,
            sort: queryParams.sort as 'created' | 'updated' | 'comments' | undefined,
            direction: queryParams.direction,
        });

        if (!result.success) {
            debug.error(`Failed to fetch issues for repository ${repoName}:`, result.error);
            res.status(404).json({
                success: false,
                error: result.error || `Failed to fetch issues for repository ${repoName}`,
            });
        }

        debug.info(`Retrieved ${result.data.length} issues for repository ${repoName}`);

        res.json({
            success: true,
            data: result.data,
            total: result.total,
            repository: {
                name: repository?.name,
                fullName: repository?.fullName,
                isPrivate: repository?.isPrivate,
            },
            pagination: {
                page: queryParams.page,
                per_page: queryParams.per_page,
                total_pages: Math.ceil((result.total || 0) / (queryParams.per_page || 50)),
                has_more: result.data.length < (result.total ?? 0),
            },
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        debug.error('Error in getIssuesByRepository controller:', {
            repository: req.params.repoName,
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
        });

        if (isValidationError(error)) {
            res.status(400).json({
                success: false,
                error: 'Invalid data format',
                details: error.message,
            });
        }

        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'Failed to fetch repository issues. Please try again later.',
        });
    }
};

// Helper method to parse and validate query parameters
const parseQueryParams = (query: any): QueryParams => {
    return {
        state: (query.state as 'open' | 'closed' | 'all') || 'all',
        labels: Array.isArray(query.labels) ? query.labels : query.labels?.split(','),
        since: query.since as string,
        page: Math.max(1, Number(query.page) || 1),
        per_page: Math.min(100, Math.max(1, Number(query.per_page) || 50)),
        sort: (query.sort as 'created' | 'updated' | 'comments') || 'updated',
        direction: (query.direction as 'asc' | 'desc') || 'desc',
    };
};
