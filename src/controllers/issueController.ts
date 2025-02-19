import { Request, Response } from 'express';
import { issueService } from '@services/github/issueService';
import { IssueModel } from '@models/issue';
import { debug } from '@utils/logger';
import { logger } from '../utils/logger';

export const issueController = {
    async getIssues(req: Request, res: Response) {
        try {
            const {
                state = 'all',
                labels,
                since,
                page = 1,
                per_page = 50,
                sort = 'updated_at',
                direction = 'desc',
                repository,
            } = req.query;

            // Validate query parameters
            if (state && !['open', 'closed', 'all'].includes(state as string)) {
                return res.status(400).json({
                    success: false,
                    error: "State must be 'open', 'closed' or 'all'",
                });
            }

            // Build query
            const query: any = {};
            if (state !== 'all') {
                query.state = state;
            }
            if (labels) {
                query['labels.name'] = {
                    $in: Array.isArray(labels) ? labels : labels.split(','),
                };
            }
            if (repository) {
                query['repository.name'] = repository;
            }
            if (since) {
                query.updated_at = { $gte: new Date(since as string) };
            }

            // Execute query with pagination
            const skip = (Number(page) - 1) * Number(per_page);
            const sortOrder = direction === 'desc' ? -1 : 1;
            const sortOption = { [sort]: sortOrder };

            const [issues, total] = await Promise.all([
                IssueModel.find(query).sort(sortOption).skip(skip).limit(Number(per_page)).lean(),
                IssueModel.countDocuments(query),
            ]);

            debug.info(`Retrieved ${issues.length} issues from database`);

            return res.json({
                success: true,
                data: issues,
                total,
                pagination: {
                    page: Number(page),
                    per_page: Number(per_page),
                    total_pages: Math.ceil(total / Number(per_page)),
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
    },

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
                return res.status(404).json({
                    success: false,
                    error: issue.error,
                });
            }

            return res.json(issue);
        } catch (error) {
            debug.error('Error in getIssueById controller:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal Server Error',
            });
        }
    },

    async createIssue(req: Request, res: Response) {
        try {
            const { title, body, labels } = req.body;
            const issue = await issueService.createIssue(title, body, labels);
            res.status(201).json(issue);
        } catch (error) {
            debug.error('Error in createIssue controller:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    async syncIssues(req: Request, res: Response) {
        try {
            debug.info('Starting issues synchronization');

            const syncResult = await issueService.syncIssues();

            if (!syncResult.success) {
                debug.error('Failed to sync issues:', syncResult.error);
                return res.status(500).json(syncResult);
            }

            debug.info(`Sync completed: ${syncResult.data.synced}/${syncResult.data.total} issues synchronized`);
            return res.json(syncResult);
        } catch (error) {
            debug.error('Error in syncIssues controller:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal Server Error',
            });
        }
    },
};
