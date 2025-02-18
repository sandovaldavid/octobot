import mongoose from 'mongoose';

const commitSchema = new mongoose.Schema(
    {
        githubId: {
            type: String,
            required: true,
            unique: true,
        },
        repository: {
            id: Number,
            name: String,
            full_name: {
                type: String,
                required: true,
            },
            private: Boolean,
        },
        commit: {
            author: {
                name: {
                    type: String,
                    required: true,
                },
                email: String,
                date: {
                    type: Date,
                    required: true,
                },
            },
            committer: {
                name: {
                    type: String,
                    required: true,
                },
                email: String,
                date: {
                    type: Date,
                    required: true,
                },
            },
            message: {
                type: String,
                required: true,
            },
            tree: {
                sha: String,
                url: String,
            },
            comment_count: {
                type: Number,
                default: 0,
            },
            verification: {
                verified: Boolean,
                reason: String,
                signature: String,
                payload: String,
            },
        },
        url: String,
        html_url: String,
        comments_url: String,
        author: {
            login: String,
            id: Number,
            avatar_url: String,
            type: String,
            site_admin: Boolean,
        },
        committer: {
            login: String,
            id: Number,
            avatar_url: String,
            type: String,
            site_admin: Boolean,
        },
        parents: [
            {
                sha: String,
                url: String,
                html_url: String,
            },
        ],
        stats: {
            total: Number,
            additions: Number,
            deletions: Number,
        },
        files: [
            {
                sha: String,
                filename: String,
                status: {
                    type: String,
                    enum: ['added', 'removed', 'modified', 'renamed', 'copied', 'changed', 'unchanged'],
                },
                additions: Number,
                deletions: Number,
                changes: Number,
                blob_url: String,
                raw_url: String,
                contents_url: String,
                patch: String,
            },
        ],
    },
    {
        timestamps: true,
    }
);

// Indexes for better query performance
commitSchema.index({ 'commit.author.date': -1 });
commitSchema.index({ 'repository.full_name': 1 });
commitSchema.index({ 'commit.message': 'text' });
commitSchema.index({ 'author.login': 1 });

export const CommitModel = mongoose.model('Commit', commitSchema);
