import { ChatInputCommandInteraction, ClientEvents } from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';

export interface DiscordCommand {
    data: SlashCommandBuilder;
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export interface DiscordEvent {
    name: keyof ClientEvents;
    once?: boolean;
    execute: (...args: any[]) => Promise<void>;
}

export interface DiscordNotification {
    type: string;
    title: string;
    description: string;
    color: number;
    fields: Array<{ name: string; value: string }>;
    timestamp: Date;
    url?: string;
    footer: { text: string };
    author: {
        name: string;
        icon_url: string;
    };
}

export interface DiscordWebhookPayload {
    channelId: string;
    content?: string;
    embeds?: DiscordNotification[];
}

export interface DiscordUserConfig {
    id: string;
    username: string;
    roles: string[];
    permissions: string[];
}

export interface DiscordChannelConfig {
    id: string;
    name: string;
    type: 'text' | 'voice' | 'category';
    isWebhookEnabled?: boolean;
}

export type CommandResponse = {
    content?: string;
    ephemeral?: boolean;
    embeds?: DiscordNotification[];
};

export interface GithubNotificationOptions {
    type:
        | 'commit'
        | 'pull_request'
        | 'issue'
        | 'release'
        | 'create'
        | 'delete'
        | 'workflow'
        | 'deployment'
        | 'deployment_status';
    action: string;
    title: string;
    description: string;
    url: string;
    author: {
        name: string;
        avatar?: string;
    };
    color?: number;
    fields?: {
        name: string;
        value: string;
        inline?: boolean;
    }[];
}

// Color constants for embeds
export const DiscordColors = {
    SUCCESS: 0x00ff00, // Verde
    ERROR: 0xff0000, // Rojo
    WARNING: 0xffa500, // Naranja
    INFO: 0x0099ff, // Azul claro
    DEFAULT: 0x7289da, // Discord Blurple
    BRANCH: 0xffff00, // Amarillo para ramas
    PR_OPEN: 0x2ecc71, // Verde claro para PRs abiertos
    PR_MERGED: 0x9b59b6, // Morado para PRs mergeados
    ISSUE_OPEN: 0x3498db, // Azul para issues abiertos
    ISSUE_CLOSED: 0xe74c3c, // Rojo para issues cerrados
} as const;

// Common permission flags
export const DiscordPermissions = {
    ADMINISTRATOR: 'Administrator',
    MANAGE_CHANNELS: 'ManageChannels',
    MANAGE_GUILD: 'ManageGuild',
    MANAGE_MESSAGES: 'ManageMessages',
    MANAGE_ROLES: 'ManageRoles',
    SEND_MESSAGES: 'SendMessages',
    VIEW_CHANNEL: 'ViewChannel',
    USE_EXTERNAL_EMOJIS: 'UseExternalEmojis',
} as const;
