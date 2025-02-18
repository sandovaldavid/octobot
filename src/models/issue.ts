import mongoose from 'mongoose';

const issueSchema = new mongoose.Schema({
    githubId: {
        type: Number,
        required: true,
        unique: true,
    },
    number: {
        type: Number,
        required: true,
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
    },
    labels: [
        {
            id: Number,
            name: String,
            description: String,
            color: String,
        },
    ],
    assignee: {
        login: String,
        id: Number,
        type: String,
        avatar_url: String,
    },
    user: {
        login: {
            type: String,
            required: true,
        },
        id: {
            type: Number,
            required: true,
        },
        type: String,
        avatar_url: String,
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
    comments: {
        type: Number,
        default: 0,
    },
    created_at: {
        type: Date,
        required: true,
    },
    updated_at: {
        type: Date,
        required: true,
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
    },
    locked: {
        type: Boolean,
        default: false,
    },
});

// Indexes for better query performance
issueSchema.index({ githubId: 1 });
issueSchema.index({ number: 1 });
issueSchema.index({ state: 1 });
issueSchema.index({ 'repository.full_name': 1 });
issueSchema.index({ created_at: -1 });
issueSchema.index({ updated_at: -1 });

export const IssueModel = mongoose.model('Issue', issueSchema);
