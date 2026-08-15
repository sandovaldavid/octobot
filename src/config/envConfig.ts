import dotenv from 'dotenv';
import { logger } from '@utils/logger';
import { validateGitHubAppEnv } from '@config/githubAppConfig';

dotenv.config();

export type AuthMode = 'github_app' | 'legacy_pat';

export interface AppEnv {
    authMode: AuthMode;
    PORT: number;
    NODE_ENV: 'development' | 'production' | 'test';
    DISCORD_TOKEN: string;
    DISCORD_CLIENT_ID: string;
    DISCORD_GUILD_ID?: string;
    DISCORD_CHANNEL_ID?: string;
    MONGODB_URI: string;
    MONGODB_DB_NAME?: string;
    GITHUB_TOKEN?: string;
    GITHUB_OWNER?: string;
    GITHUB_REPO?: string;
    GITHUB_WEBHOOK_SECRET: string;
    API_URL: string;
    // GitHub App fields (when authMode === 'github_app')
    GITHUB_APP_ID?: number;
    GITHUB_APP_PRIVATE_KEY?: string;
    GITHUB_CLIENT_ID?: string;
    GITHUB_CLIENT_SECRET?: string;
}

export function validateEnv(customEnv?: Record<string, string | undefined>): AppEnv {
    const source = customEnv || process.env;

    // Detect authentication mode
    const isGitHubAppMode = Boolean(
        source.GITHUB_APP_ID ||
        source.GITHUB_APP_PRIVATE_KEY ||
        (source.GITHUB_CLIENT_ID && source.GITHUB_CLIENT_SECRET)
    );

    const baseRequiredVars: string[] = [
        'DISCORD_TOKEN',
        'DISCORD_CLIENT_ID',
        'MONGODB_URI',
        'GITHUB_WEBHOOK_SECRET',
        'API_URL',
    ];

    if (isGitHubAppMode) {
        // Validate base infrastructure variables
        const missingBase = baseRequiredVars.filter((key) => !source[key]);
        if (missingBase.length > 0) {
            const errorMsg = `Variables de entorno críticas faltantes: ${missingBase.join(', ')}`;
            logger.error(`❌ ${errorMsg}`);
            throw new Error(errorMsg);
        }

        // Validate GitHub App specific configuration
        const appConfig = validateGitHubAppEnv(source);

        return {
            authMode: 'github_app',
            PORT: Number(source.PORT) || 4000,
            NODE_ENV: (source.NODE_ENV as AppEnv['NODE_ENV']) || 'development',
            DISCORD_TOKEN: source.DISCORD_TOKEN!,
            DISCORD_CLIENT_ID: source.DISCORD_CLIENT_ID!,
            DISCORD_GUILD_ID: source.DISCORD_GUILD_ID,
            DISCORD_CHANNEL_ID: source.DISCORD_CHANNEL_ID,
            MONGODB_URI: source.MONGODB_URI!,
            MONGODB_DB_NAME: source.MONGODB_DB_NAME || source.MONGO_DATABASE,
            GITHUB_TOKEN: source.GITHUB_TOKEN,
            GITHUB_OWNER: source.GITHUB_OWNER,
            GITHUB_REPO: source.GITHUB_REPO,
            GITHUB_WEBHOOK_SECRET: appConfig.webhookSecret,
            API_URL: source.API_URL!,
            GITHUB_APP_ID: appConfig.appId,
            GITHUB_APP_PRIVATE_KEY: appConfig.privateKey,
            GITHUB_CLIENT_ID: appConfig.clientId,
            GITHUB_CLIENT_SECRET: appConfig.clientSecret,
        };
    }

    // Legacy PAT Mode (deprecated compatibility)
    const legacyRequiredVars: string[] = [...baseRequiredVars, 'DISCORD_GUILD_ID', 'GITHUB_TOKEN', 'GITHUB_OWNER'];

    const missingLegacy = legacyRequiredVars.filter((key) => !source[key]);
    if (missingLegacy.length > 0) {
        const errorMsg = `Variables de entorno críticas faltantes: ${missingLegacy.join(', ')}`;
        logger.error(`❌ ${errorMsg}`);
        throw new Error(errorMsg);
    }

    logger.warn(
        '⚠️ Running in legacy single-tenant PAT mode. This mode is deprecated and will be removed in a future major release. Upgrade to GitHub App mode.'
    );

    return {
        authMode: 'legacy_pat',
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
