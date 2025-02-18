import { Request, Response } from 'express';
import { issueService } from '@services/github/issue.service';
import { IssueModel } from '@models/issue.model';
import { debug } from '@utils/logger';

export const issueController = {
    async getIssues(req: Request, res: Response) {
        try {
            const { state = 'open' } = req.query;
            const issues = await issueService.getIssues(state as 'open' | 'closed' | 'all');
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
