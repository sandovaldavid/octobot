import { Request, Response } from 'express';
import { ChatInputCommandInteraction, ButtonInteraction } from 'discord.js';
import { issueService } from '@services/github/issueService';
import { IssueDisplayService } from '@services/discord/issueDisplayService';
import { IssueModel } from '@models/issue';
import { debug } from '@utils/logger';
import { CommandConfig } from '@config/commandConfig';
import { RepositoryModel } from '@models/repository';
import { isValidationError } from '@types/errors';

export class IssueListController {
    private currentPage: number;
    private readonly perPage: number;
    private readonly state: string;
    private readonly repo?: string;

    constructor(interaction: ChatInputCommandInteraction) {
        this.currentPage = 1;
        this.perPage = CommandConfig.pagination.perPage;
        this.state = interaction.options.getString('state') || 'open';
        this.repo = interaction.options.getString('repo');
    }

    async handlePagination(interaction: ButtonInteraction): Promise<void> {
        try {
            await interaction.deferUpdate();

            if (interaction.customId === 'prev' && this.currentPage > 1) {
                this.currentPage--;
            } else if (interaction.customId === 'next') {
                this.currentPage++;
            }

            const result = await IssueDisplayService.fetchAndDisplay({
                state: this.state as 'open' | 'closed' | 'all',
                repo: this.repo,
                page: this.currentPage,
                perPage: this.perPage,
            });

            await interaction.editReply({
                embeds: [result.embed],
                components: result.buttons ? [result.buttons] : [],
            });
        } catch (error) {
            debug.error('Error in pagination:', error);
            throw error;
        }
    }
}

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

class IssueController {
    constructor() {
        this.getIssues = this.getIssues.bind(this);
        this.getIssueById = this.getIssueById.bind(this);
        this.createIssue = this.createIssue.bind(this);
        this.syncIssues = this.syncIssues.bind(this);
        this.getIssuesByRepository = this.getIssuesByRepository.bind(this);
        this.parseQueryParams = this.parseQueryParams.bind(this);
        this.validateQueryParams = this.validateQueryParams.bind(this);
        this.buildQuery = this.buildQuery.bind(this);
    }

    private validateQueryParams(params: QueryParams): boolean {
        if (params.state && !['open', 'closed', 'all'].includes(params.state)) {
            return false;
        }
        return true;
    }

    private buildQuery(params: QueryParams): any {
        const query: any = {};

        if (params.state !== 'all') {
            query.state = params.state;
        }
        if (params.labels) {
            query['labels.name'] = {
                $in: Array.isArray(params.labels) ? params.labels : params.labels.split(','),
            };
        }
        if (params.repository) {
            query['repository.name'] = params.repository;
        }
        if (params.since) {
            query.updated_at = { $gte: new Date(params.since) };
        }

        return query;
    }

    async getIssues(req: Request, res: Response) {
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

            if (!this.validateQueryParams(params)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid query parameters',
                });
            }

            const query = this.buildQuery(params);
            const skip = (params.page - 1) * params.per_page;
            const sortOption = { [params.sort]: params.direction === 'desc' ? -1 : 1 };

            const [issues, total] = await Promise.all([
                IssueModel.find(query).sort(sortOption).skip(skip).limit(params.per_page).lean(),
                IssueModel.countDocuments(query),
            ]);

            debug.info(`Retrieved ${issues.length} issues from database`);

            return res.json({
                success: true,
                data: issues,
                total,
                pagination: {
                    page: params.page,
                    per_page: params.per_page,
                    total_pages: Math.ceil(total / params.per_page),
                    has_more: skip + issues.length < total,
                },
            });
        } catch (error) {
            debug.error('Error in getIssues controller:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal Server Error',
            });
        }
    }

    async getIssueById(req: Request, res: Response) {
        try {
            const { issueNumber } = req.params;
            const { repo } = req.query;

            if (!issueNumber || isNaN(Number(issueNumber))) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid issue number',
                });
            }

            const issue = await issueService.getIssueById(Number(issueNumber), repo as string);

            if (!issue.success) {
                return res.status(404).json(issue);
            }

            return res.json(issue);
        } catch (error) {
            debug.error('Error in getIssueById controller:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal Server Error',
            });
        }
    }

    async createIssue(req: Request, res: Response) {
        try {
            const { title, body, labels } = req.body;
            const issue = await issueService.createIssue(title, body, labels);
            res.status(201).json(issue);
        } catch (error) {
            debug.error('Error in createIssue controller:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    async syncIssues(req: Request, res: Response) {
        try {
            debug.info('Starting issues synchronization');

            const repositories = await RepositoryModel.find({}, { name: 1 }).lean();

            if (!repositories.length) {
                debug.warn('No repositories found in database');
                return res.status(400).json({
                    success: false,
                    error: 'No repositories found in database. Please sync repositories first using /github repo sync',
                });
            }

            const syncResult = await issueService.syncIssues();

            if (!syncResult.success) {
                debug.error('Failed to sync issues:', syncResult.error);
                return res.status(400).json({
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

            return res.json({
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

            if (error.name === 'ValidationError') {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid data format',
                    details: error.message,
                });
            }

            if (error.code === 11000) {
                return res.status(409).json({
                    success: false,
                    error: 'Duplicate issue detected',
                    details: error.message,
                });
            }

            return res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: 'Failed to synchronize issues. Please try again later.',
            });
        }
    }

    async getIssuesByRepository(req: Request, res: Response) {
        try {
            const { repoName } = req.params;

            if (!repoName) {
                return res.status(400).json({
                    success: false,
                    error: 'Repository name is required',
                });
            }

            const repository = await RepositoryModel.findOne({ name: repoName });
            if (!repository) {
                debug.warn(`Repository ${repoName} not found in database`);
                return res.status(404).json({
                    success: false,
                    error: `Repository '${repoName}' not found. Please sync repositories first using /github repo sync`,
                });
            }

            const queryParams = this.parseQueryParams(req.query);
            if (!this.validateQueryParams(queryParams)) {
                return res.status(400).json({
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
                sort: queryParams.sort,
                direction: queryParams.direction,
            });

            if (!result.success) {
                debug.error(`Failed to fetch issues for repository ${repoName}:`, result.error);
                return res.status(404).json({
                    success: false,
                    error: result.error || `Failed to fetch issues for repository ${repoName}`,
                });
            }

            debug.info(`Retrieved ${result.data.length} issues for repository ${repoName}`);

            return res.json({
                success: true,
                data: result.data,
                total: result.total,
                repository: {
                    name: repository.name,
                    fullName: repository.fullName,
                    isPrivate: repository.isPrivate,
                },
                pagination: {
                    page: queryParams.page,
                    per_page: queryParams.per_page,
                    total_pages: Math.ceil((result.total || 0) / queryParams.per_page),
                    has_more: result.pagination?.hasMore || false,
                },
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            debug.error('Error in getIssuesByRepository controller:', {
                repository: repoName,
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
            });

            if (isValidationError(error)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid data format',
                    details: error.message,
                });
            }

            return res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: 'Failed to fetch repository issues. Please try again later.',
            });
        }
    }

    // Helper method to parse and validate query parameters
    parseQueryParams(query: any): QueryParams {
        return {
            state: (query.state as 'open' | 'closed' | 'all') || 'all',
            labels: Array.isArray(query.labels) ? query.labels : query.labels?.split(','),
            since: query.since as string,
            page: Math.max(1, Number(query.page) || 1),
            per_page: Math.min(100, Math.max(1, Number(query.per_page) || 50)),
            sort: (query.sort as 'created' | 'updated' | 'comments') || 'updated',
            direction: (query.direction as 'asc' | 'desc') || 'desc',
        };
    }
}

export const issueController = new IssueController();
