export interface GitHubAppConfig {
    appId: number;
    privateKey: string;
    webhookSecret: string;
    clientId: string;
    clientSecret: string;
}

export function validateGitHubAppEnv(env: Record<string, string | undefined> = process.env): GitHubAppConfig {
    const appIdStr = env.GITHUB_APP_ID;
    const privateKey = env.GITHUB_APP_PRIVATE_KEY;
    const webhookSecret = env.GITHUB_WEBHOOK_SECRET;
    const clientId = env.GITHUB_CLIENT_ID;
    const clientSecret = env.GITHUB_CLIENT_SECRET;

    if (!appIdStr || isNaN(Number(appIdStr)) || appIdStr.trim() === '') {
        throw new Error('Invalid or missing GITHUB_APP_ID (must be numeric string)');
    }
    if (!privateKey || !privateKey.includes('PRIVATE KEY')) {
        throw new Error('Invalid or missing GITHUB_APP_PRIVATE_KEY');
    }
    if (!webhookSecret || webhookSecret.trim() === '') {
        throw new Error('Missing GITHUB_WEBHOOK_SECRET');
    }
    if (!clientId || clientId.trim() === '') {
        throw new Error('Missing GITHUB_CLIENT_ID');
    }
    if (!clientSecret || clientSecret.trim() === '') {
        throw new Error('Missing GITHUB_CLIENT_SECRET');
    }

    return {
        appId: Number(appIdStr),
        privateKey: privateKey.replace(/\\n/g, '\n'),
        webhookSecret,
        clientId,
        clientSecret,
    };
}

let cachedConfig: GitHubAppConfig | null = null;

export function getGitHubAppConfig(): GitHubAppConfig {
    if (!cachedConfig) {
        cachedConfig = validateGitHubAppEnv();
    }
    return cachedConfig;
}
