import { ChatInputCommandInteraction, Message, TextChannel, ClientEvents, GuildMember, Role } from 'discord.js';

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
    type: 'success' | 'error' | 'info' | 'warning';
    title: string;
    description: string;
    fields?: {
        name: string;
        value: string;
        inline?: boolean;
    }[];
    color?: number;
    timestamp?: Date;
    footer?: string;
    thumbnail?: string;
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
    type: 'issue' | 'pull_request' | 'commit' | 'release';
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
    SUCCESS: 0x00ff00, // Green
    ERROR: 0xff0000, // Red
    WARNING: 0xffff00, // Yellow
    INFO: 0x0000ff, // Blue
    DEFAULT: 0x7289da, // Discord Blurple
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
