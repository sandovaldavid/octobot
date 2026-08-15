import { EmbedBuilder, ActionRowBuilder, ButtonBuilder } from 'discord.js';

export interface IssueDisplayOptions {
    state: 'open' | 'closed' | 'all';
    repo: string;
    page: number;
    perPage: number;
    sort?: 'created' | 'updated' | 'comments';
    direction?: 'asc' | 'desc';
}

export interface IssueDisplayResult {
    success: boolean;
    embed: EmbedBuilder;
    buttons?: ActionRowBuilder<ButtonBuilder>;
    page?: number;
    hasNext?: boolean;
    hasPrevious?: boolean;
}

export interface PaginationOptions {
    currentPage?: number;
    totalPages?: number;
    hasPrevious?: boolean;
    hasNext?: boolean;
    isDisabled?: boolean;
}
