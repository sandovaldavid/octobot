import dotenv from 'dotenv';
import { logger } from '@utils/logger';

dotenv.config();

export interface AppEnv {
    PORT: number;
    NODE_ENV: 'development' | 'production' | 'test';
    DISCORD_TOKEN: string;
    DISCORD_CLIENT_ID: string;
    DISCORD_GUILD_ID: string;
    DISCORD_CHANNEL_ID?: string;
    MONGODB_URI: string;
    MONGODB_DB_NAME?: string;
    GITHUB_TOKEN: string;
    GITHUB_OWNER: string;
    GITHUB_REPO?: string;
    GITHUB_WEBHOOK_SECRET: string;
    API_URL: string;
}

export function validateEnv(customEnv?: Record<string, string | undefined>): AppEnv {
    const source = customEnv || process.env;
    const requiredVars: (keyof AppEnv)[] = [
        'DISCORD_TOKEN',
        'DISCORD_CLIENT_ID',
        'DISCORD_GUILD_ID',
        'MONGODB_URI',
        'GITHUB_TOKEN',
        'GITHUB_OWNER',
        'GITHUB_WEBHOOK_SECRET',
        'API_URL',
    ];

    const missing = requiredVars.filter((key) => !source[key]);

    if (missing.length > 0) {
        const errorMsg = `Variables de entorno críticas faltantes: ${missing.join(', ')}`;
        logger.error(`❌ ${errorMsg}`);
        throw new Error(errorMsg);
    }

    return {
        PORT: Number(source.PORT) || 4000,
        NODE_ENV: (source.NODE_ENV as AppEnv['NODE_ENV']) || 'development',
        DISCORD_TOKEN: source.DISCORD_TOKEN!,
        DISCORD_CLIENT_ID: source.DISCORD_CLIENT_ID!,
        DISCORD_GUILD_ID: source.DISCORD_GUILD_ID!,
        DISCORD_CHANNEL_ID: source.DISCORD_CHANNEL_ID,
        MONGODB_URI: source.MONGODB_URI!,
        MONGODB_DB_NAME: source.MONGODB_DB_NAME || source.MONGO_DATABASE,
        GITHUB_TOKEN: source.GITHUB_TOKEN!,
        GITHUB_OWNER: source.GITHUB_OWNER!,
        GITHUB_REPO: source.GITHUB_REPO,
        GITHUB_WEBHOOK_SECRET: source.GITHUB_WEBHOOK_SECRET!,
        API_URL: source.API_URL!,
    };
}
