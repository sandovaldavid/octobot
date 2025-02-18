import mongoose from 'mongoose';

const issueSchema = new mongoose.Schema({
    githubId: {
        type: Number,
        required: true,
        unique: true,
    },
    title: {
        type: String,
        required: true,
    },
    body: String,
    state: {
        type: String,
        enum: ['open', 'closed'],
        default: 'open',
    },
    labels: [
        {
            type: String,
        },
    ],
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
    assignee: String,
    repository: {
        type: String,
        required: true,
    },
});

export const IssueModel = mongoose.model('Issue', issueSchema);
