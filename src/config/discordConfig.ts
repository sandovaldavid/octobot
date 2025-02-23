import { Client, GatewayIntentBits } from 'discord.js';
import { debug } from '@utils/logger';

interface DiscordConfig {
    token: string;
    channelId: string;
    guildId?: string;
    clientId?: string;
}

class DiscordClient {
    private static instance: DiscordClient;
    private client: Client;
    private config: DiscordConfig;

    private constructor(config: DiscordConfig) {
        this.config = config;
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildWebhooks,
            ],
        });

        this.initializeClient();
    }

    private initializeClient() {
        this.client.once('ready', () => {
            debug.info(`Discord Bot logged in as ${this.client.user?.tag}`);
        });

        this.client.on('error', (error) => {
            debug.error('Discord Client Error:', error);
        });

        this.client.login(this.config.token).catch((error) => {
            debug.error('Discord Login Error:', error);
        });
    }

    public static getInstance(config?: DiscordConfig): DiscordClient {
        if (!DiscordClient.instance && config) {
            DiscordClient.instance = new DiscordClient(config);
        }
        return DiscordClient.instance;
    }

    public getClient(): Client {
        return this.client;
    }

    public getConfig(): DiscordConfig {
        return this.config;
    }

    public async testConnection(): Promise<boolean> {
        try {
            if (!this.client.isReady()) {
                debug.warn('Discord client not ready, attempting to connect...');
                await this.client.login(this.config.token);
            }

            const channel = await this.client.channels.fetch(this.config.channelId);
            if (!channel || !channel.isTextBased()) {
                throw new Error(`Channel ${this.config.channelId} not found or is not a text channel`);
            }

            debug.info(`Successfully connected to Discord as ${this.client.user?.tag}`);
            if (channel.isTextBased() && 'name' in channel) {
                debug.info(`Connected to channel: ${channel.name}`);
            }

            return true;
        } catch (error) {
            debug.error('Discord connection test failed:', error);
            return false;
        }
    }
}

const defaultConfig: DiscordConfig = {
    token: process.env.DISCORD_TOKEN || '',
    channelId: process.env.DISCORD_CHANNEL_ID || '',
    guildId: process.env.DISCORD_GUILD_ID,
    clientId: process.env.DISCORD_CLIENT_ID,
};

export const discordClient = DiscordClient.getInstance(defaultConfig);
export type { DiscordConfig };
