import { Request, Response } from 'express';
import { issueService } from '@services/github/issueService';
import { IssueModel } from '@models/issue';
import { debug } from '@utils/logger';
import { logger } from '../utils/logger';

export const issueController = {
    async getIssues(req: Request, res: Response) {
        try {
            const { state = 'open', labels, since, page, per_page, sort, direction } = req.query;

            const issues = await issueService.getIssues({
                state: state as 'open' | 'closed' | 'all',
                labels: Array.isArray(labels) ? labels : labels?.split(','),
                since: since as string,
                page: page ? Number(page) : undefined,
                per_page: per_page ? Number(per_page) : undefined,
                sort: sort as 'created' | 'updated' | 'comments',
                direction: direction as 'asc' | 'desc',
            });

            res.json(issues);
        } catch (error) {
            debug.error('Error in getIssues controller:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    async getIssueById(req: Request, res: Response) {
        try {
            const { issueNumber } = req.params;
            const issue = await issueService.getIssueById(Number(issueNumber));
            res.json(issue);
        } catch (error) {
            debug.error('Error in getIssueById controller:', error);
            res.status(500).json({ error: 'Internal Server Error' });
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
};
