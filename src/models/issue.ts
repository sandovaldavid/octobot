import mongoose from 'mongoose';
import { GithubIssue } from '@/types/github';

const userSchema = new mongoose.Schema(
    {
        login: { type: String, required: true },
        id: { type: Number, required: true },
        type: { type: String, required: true },
        avatar_url: { type: String },
    },
    { _id: false }
);

const issueSchema = new mongoose.Schema(
    {
        githubId: {
            type: Number,
            required: true,
            index: true,
        },
        number: {
            type: Number,
            required: true,
            index: true,
        },
        title: {
            type: String,
            required: true,
        },
        body: {
            type: String,
            default: '',
        },
        state: {
            type: String,
            enum: ['open', 'closed'],
            default: 'open',
            index: true,
        },
        labels: [
            {
                id: Number,
                name: String,
                description: String,
                color: String,
                _id: false,
            },
        ],
        user: userSchema,
        assignee: userSchema,
        repository: {
            id: Number,
            name: String,
            full_name: String,
            private: Boolean,
            _id: false,
        },
        comments: {
            type: Number,
            default: 0,
        },
        created_at: {
            type: Date,
            required: true,
            index: true,
        },
        updated_at: {
            type: Date,
            required: true,
            index: true,
        },
        closed_at: {
            type: Date,
            default: null,
        },
        url: String,
        html_url: String,
        comments_url: String,
        milestone: {
            id: Number,
            number: Number,
            title: String,
            description: String,
            state: String,
            due_on: Date,
            _id: false,
        },
        locked: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

// Indexes
issueSchema.index({ 'repository.full_name': 1, number: 1 }, { unique: true, name: 'repository_issue_number' });
issueSchema.index({ githubId: 1, 'repository.full_name': 1 }, { unique: true });
issueSchema.index({ state: 1, created_at: -1 });
issueSchema.index({ 'user.login': 1 });
issueSchema.index({ 'assignee.login': 1 });
issueSchema.index({ title: 'text', body: 'text' });

export const IssueModel = mongoose.model<GithubIssue>('Issue', issueSchema);
