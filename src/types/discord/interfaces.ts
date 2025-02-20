import { EmbedBuilder, ActionRowBuilder, ButtonBuilder } from 'discord.js';
import { GithubIssue } from '../github/interfaces';

export interface IssueDisplayOptions {
    state: 'open' | 'closed' | 'all';
    repo?: string;
    page: number;
    perPage: number;
    sort?: 'created' | 'updated' | 'comments';
    direction?: 'asc' | 'desc';
}

export interface IssueDisplayResult {
    success: boolean;
    embed: EmbedBuilder;
    buttons?: ActionRowBuilder<ButtonBuilder>;
    totalPages?: number;
    totalIssues?: number;
}

export interface PaginationOptions {
    currentPage: number;
    totalPages: number;
    isDisabled?: boolean;
}
