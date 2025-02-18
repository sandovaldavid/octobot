import mongoose, { Document } from 'mongoose';
import { GithubRepository } from '@types/githubTypes';

export interface IRepository extends Document, Omit<GithubRepository, 'id'> {
    githubId: number;
    webhookActive: boolean;
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
    owner: {
        login: String,
        id: Number,
        type: String,
    },
    webhookActive: {
        type: Boolean,
        default: false,
    },
});

repositorySchema.index({ 'owner.login': 1 });

export const RepositoryModel = mongoose.model('Repository', repositorySchema);
