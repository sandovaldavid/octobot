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
        let color: number;
        let eventType = options.type;
        let actionText = options.action;

        // Determinar color basado en tipo y acción
        switch (options.type) {
            case 'commit':
                color = DiscordColors.SUCCESS;
                break;
            case 'create':
                if (options.action === 'branch') {
                    color = DiscordColors.BRANCH;
                    actionText = 'Branch created';
                } else {
                    color = DiscordColors.DEFAULT;
                }
                break;
            case 'delete':
                if (options.action === 'branch') {
                    color = DiscordColors.ERROR;
                    actionText = 'Branch deleted';
                } else {
                    color = DiscordColors.WARNING;
                }
                break;
            case 'pull_request':
                color =
                    options.action === 'merged'
                        ? DiscordColors.PR_MERGED
                        : options.action === 'closed'
                          ? DiscordColors.ERROR
                          : DiscordColors.PR_OPEN;
                break;
            case 'issue':
                color = options.action === 'closed' ? DiscordColors.ISSUE_CLOSED : DiscordColors.ISSUE_OPEN;
                break;
            case 'release':
                color = DiscordColors.INFO;
                break;
            case 'workflow':
                color =
                    options.action === 'success'
                        ? DiscordColors.SUCCESS
                        : options.action === 'failure'
                          ? DiscordColors.ERROR
                          : DiscordColors.WARNING;
                break;
            case 'deployment':
            case 'deployment_status':
                color =
                    options.action === 'success'
                        ? DiscordColors.SUCCESS
                        : options.action === 'failure'
                          ? DiscordColors.ERROR
                          : DiscordColors.INFO;
                break;
            default:
                color = DiscordColors.DEFAULT;
        }

        // Crear notificación
        const notification: DiscordNotification = {
            type: 'info',
            title: options.title,
            description: options.description,
            color: options.color || color,
            fields: options.fields || [],
            timestamp: new Date(),
            author: {
                name: options.author.name,
                icon_url: options.author.avatar,
            },
            url: options.url,
            footer: {
                text: `GitHub ${eventType} - ${actionText}`,
            },
        };

        // Log para debugging
        debug.info('Created notification:', {
            type: eventType,
            action: actionText,
            color: color.toString(16),
            title: options.title,
        });

        return notification;
    }
}

export const discordService = DiscordService.getInstance();
