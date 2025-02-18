import { TextChannel } from 'discord.js';
import { DiscordNotification, GithubNotificationOptions, DiscordColors } from '@types/discordTypes';
import { discordClient } from '@config/discordConfig';
import { debug } from '@utils/logger';

export class DiscordService {
    private static instance: DiscordService;
    private client = discordClient.getClient();
    private config = discordClient.getConfig();

    private constructor() {}

    public static getInstance(): DiscordService {
        if (!DiscordService.instance) {
            DiscordService.instance = new DiscordService();
        }
        return DiscordService.instance;
    }

    public async sendNotification(
        channelId: string = this.config.channelId,
        notification: DiscordNotification
    ): Promise<void> {
        try {
            debug.info(`Attempting to send notification to channel ${channelId}`);

            if (!this.client.isReady()) {
                debug.error('Discord client not ready');
                throw new Error('Discord client not ready');
            }

            const channel = (await this.client.channels.fetch(channelId)) as TextChannel;

            if (!channel?.isTextBased()) {
                debug.error(`Channel ${channelId} not found or is not a text channel`);
                throw new Error(`Channel ${channelId} not found or is not a text channel`);
            }

            debug.info('Sending notification with data:', notification);
            await channel.send({ embeds: [notification] });
            debug.info(`Notification sent successfully to channel ${channel.name}`);
        } catch (error) {
            debug.error('Error sending Discord notification:', error);
            throw error;
        }
    }

    public createGithubNotification(options: GithubNotificationOptions): DiscordNotification {
        const colors = {
            issue: DiscordColors.INFO,
            pull_request: DiscordColors.WARNING,
            commit: DiscordColors.SUCCESS,
            release: DiscordColors.DEFAULT,
        };

        return {
            type: 'info',
            title: options.title,
            description: options.description,
            color: options.color || colors[options.type],
            fields: options.fields,
            timestamp: new Date(),
            author: {
                name: options.author.name,
                icon_url: options.author.avatar,
            },
            url: options.url,
            footer: {
                text: `GitHub ${options.type} - ${options.action}`,
            },
        };
    }
}

export const discordService = DiscordService.getInstance();
