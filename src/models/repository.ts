import mongoose, { Document } from 'mongoose';
import { GithubRepository } from '@/types/github';
import { WEBHOOK_EVENTS } from '@/types/webhook';

export interface IRepository extends Document, Omit<GithubRepository, 'id'> {
    githubId: number;
    webhookActive: boolean;
    webhookSettings?: {
        events: typeof WEBHOOK_EVENTS;
        channelId: string;
    };
}

const repositorySchema = new mongoose.Schema({
    githubId: {
        type: Number,
        required: true,
        unique: true,
    },
    name: {
        type: String,
        required: true,
    },
    fullName: {
        type: String,
        required: true,
        unique: true,
    },
    description: {
        type: String,
        default: '',
    },
    url: {
        type: String,
        required: true,
    },
    isPrivate: {
        type: Boolean,
        default: false,
    },
    language: {
        type: String,
        default: null,
    },
    stars: {
        type: Number,
        default: 0,
    },
    forks: {
        type: Number,
        default: 0,
    },
    defaultBranch: {
        type: String,
        default: 'main',
    },
    createdAt: {
        type: Date,
        required: true,
    },
    updatedAt: {
        type: Date,
        required: true,
    },
    topics: [
        {
            type: String,
        },
    ],
    stats: {
        lastUpdated: {
            type: Date,
            default: Date.now,
        },
        data: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
    },
    owner: {
        login: {
            type: String,
            required: true,
        },
        id: {
            type: Number,
            required: true,
        },
        type: {
            type: String,
            required: true,
        },
        avatar_url: {
            type: String,
        },
    },
    webhookActive: {
        type: Boolean,
        default: false,
    },
    webhookSettings: {
        events: [
            {
                type: String,
                enum: WEBHOOK_EVENTS,
            },
        ],
        channelId: String,
    },
});

repositorySchema.index({ 'owner.login': 1 });

export const RepositoryModel = mongoose.model('Repository', repositorySchema);
