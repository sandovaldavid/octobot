import crypto from 'crypto';
import type { Request, Response } from 'express';
import type { GitHubAppConfig } from '../config/githubAppConfig';
import type { DiscordGuildConnectionModel } from '../models/discordGuildConnection';
import type { GitHubConnectionAttemptModel } from '../models/githubConnectionAttempt';
import type { GitHubInstallationModel } from '../models/githubInstallation';

export interface GitHubOnboardingControllerDeps {
    appConfig: GitHubAppConfig;
    installationModel: typeof GitHubInstallationModel;
    connectionModel: typeof DiscordGuildConnectionModel;
    attemptModel: typeof GitHubConnectionAttemptModel;
    appSlug?: string;
    fetchFn?: typeof fetch;
}

export interface GitHubOnboardingController {
    createConnectUrl(guildId: string, userId: string, appSlug?: string): Promise<string>;
    handleSetup(req: Request, res: Response): Promise<void>;
    handleCallback(req: Request, res: Response): Promise<void>;
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function renderErrorPage(message: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OctoBot - Connection Error</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #0f172a; color: #f8fafc;">
    <div style="text-align: center; padding: 2.5rem; border-radius: 12px; background: #1e293b; max-width: 480px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5); margin: 1rem;">
        <h1 style="color: #f87171; margin-top: 0; margin-bottom: 1rem;">⚠️ Connection Error</h1>
        <p style="color: #94a3b8; line-height: 1.5; margin-bottom: 1.5rem;">${escapeHtml(message)}</p>
        <p style="color: #64748b; font-size: 0.875rem; margin: 0;">You can close this tab and return to Discord.</p>
    </div>
</body>
</html>`;
}

function renderSuccessPage(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OctoBot - Connected</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #0f172a; color: #f8fafc;">
    <div style="text-align: center; padding: 2.5rem; border-radius: 12px; background: #1e293b; max-width: 480px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5); margin: 1rem;">
        <h1 style="color: #38bdf8; margin-top: 0; margin-bottom: 1rem;">🐙 OctoBot Connected!</h1>
        <p style="color: #94a3b8; line-height: 1.5; margin-bottom: 1rem;">Your GitHub App installation has been securely linked to your Discord server.</p>
        <p style="color: #94a3b8; line-height: 1.5; margin-bottom: 0;">You can now return to Discord and use <code style="background: #334155; padding: 0.2rem 0.4rem; border-radius: 4px; color: #e2e8f0;">/gh repo watch</code>.</p>
    </div>
</body>
</html>`;
}

export function createOnboardingController(deps: GitHubOnboardingControllerDeps): GitHubOnboardingController {
    const hashNonce = (nonce: string): string => crypto.createHash('sha256').update(nonce).digest('hex');

    const generatePkce = (): { verifier: string; challenge: string } => {
        const verifier = crypto.randomBytes(32).toString('base64url');
        const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
        return { verifier, challenge };
    };

    return {
        async createConnectUrl(guildId: string, userId: string, appSlug?: string): Promise<string> {
            const installNonce = crypto.randomBytes(32).toString('hex');
            const installStateHash = hashNonce(installNonce);
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

            await deps.attemptModel.create({
                installStateHash,
                guildId,
                initiatedByDiscordUserId: userId,
                status: 'pending_setup',
                expiresAt,
            });

            const slug = appSlug || deps.appSlug || 'octobot';
            return `https://github.com/apps/${slug}/installations/new?state=${installNonce}`;
        },

        async handleSetup(req: Request, res: Response): Promise<void> {
            const installationIdStr = req.query.installation_id as string | undefined;
            const state = req.query.state as string | undefined;

            const installationId = Number(installationIdStr);
            if (
                !installationIdStr ||
                isNaN(installationId) ||
                installationId <= 0 ||
                !state ||
                typeof state !== 'string'
            ) {
                res.status(400).send(
                    renderErrorPage('Invalid setup parameters. Both installation_id and state are required.')
                );
                return;
            }

            const installStateHash = hashNonce(state);
            const attempt = await deps.attemptModel.findOne({
                installStateHash,
                status: 'pending_setup',
                expiresAt: { $gt: new Date() },
            });

            if (!attempt) {
                res.status(400).send(
                    renderErrorPage('Connection request expired or already consumed. Please run /gh connect again.')
                );
                return;
            }

            const oauthNonce = crypto.randomBytes(32).toString('hex');
            const { verifier, challenge } = generatePkce();

            attempt.oauthStateHash = hashNonce(oauthNonce);
            attempt.oauthCodeVerifier = verifier;
            attempt.candidateInstallationId = installationId;
            attempt.status = 'pending_oauth';
            await attempt.save();

            const authorizeUrl = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(
                deps.appConfig.clientId
            )}&state=${encodeURIComponent(oauthNonce)}&code_challenge=${encodeURIComponent(
                challenge
            )}&code_challenge_method=S256&scope=read:user`;

            res.redirect(302, authorizeUrl);
        },

        async handleCallback(req: Request, res: Response): Promise<void> {
            const code = req.query.code as string | undefined;
            const state = req.query.state as string | undefined;

            if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
                res.status(400).send(renderErrorPage('Invalid callback parameters. Both code and state are required.'));
                return;
            }

            const oauthStateHash = hashNonce(state);
            const attempt = await deps.attemptModel.findOneAndUpdate(
                {
                    oauthStateHash,
                    status: 'pending_oauth',
                    expiresAt: { $gt: new Date() },
                },
                { status: 'verifying' },
                { new: true }
            );

            if (!attempt || !attempt.candidateInstallationId || !attempt.oauthCodeVerifier) {
                res.status(400).send(
                    renderErrorPage('Invalid or expired authorization session. Please try connecting again.')
                );
                return;
            }

            const fetchFn = deps.fetchFn || fetch;
            let tokenData: any;

            try {
                const tokenResponse = await fetchFn('https://github.com/login/oauth/access_token', {
                    method: 'POST',
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                        'User-Agent': 'OctoBot',
                    },
                    body: JSON.stringify({
                        client_id: deps.appConfig.clientId,
                        client_secret: deps.appConfig.clientSecret,
                        code,
                        code_verifier: attempt.oauthCodeVerifier,
                    }),
                });

                tokenData = await tokenResponse.json().catch(() => ({}));
                if (!tokenResponse.ok && !tokenData?.error && !tokenData?.error_description) {
                    throw new Error(`OAuth token exchange returned status ${tokenResponse.status}`);
                }
            } catch {
                await deps.attemptModel.updateOne(
                    { _id: attempt._id },
                    { status: 'failed', oauthCodeVerifier: undefined }
                );
                res.status(400).send(renderErrorPage('Failed to exchange authorization code with GitHub.'));
                return;
            }

            if (!tokenData || !tokenData.access_token || tokenData.error) {
                await deps.attemptModel.updateOne(
                    { _id: attempt._id },
                    { status: 'failed', oauthCodeVerifier: undefined }
                );
                const errorMsg = tokenData?.error_description || 'GitHub OAuth authorization was rejected or expired.';
                res.status(400).send(renderErrorPage(errorMsg));
                return;
            }

            const accessToken = tokenData.access_token;
            let installationsData: any;

            try {
                const instResponse = await fetchFn('https://api.github.com/user/installations', {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        Accept: 'application/vnd.github+json',
                        'User-Agent': 'OctoBot',
                    },
                });

                if (!instResponse.ok) {
                    throw new Error(`User installations check returned status ${instResponse.status}`);
                }
                installationsData = await instResponse.json();
            } catch {
                await deps.attemptModel.updateOne(
                    { _id: attempt._id },
                    { status: 'failed', oauthCodeVerifier: undefined }
                );
                res.status(403).send(
                    renderErrorPage('Installation verification failed. Unable to verify user permissions on GitHub.')
                );
                return;
            }

            const accessibleInstallations: any[] = installationsData?.installations || [];
            const matchedInstallation = accessibleInstallations.find(
                (inst: any) => inst.id === attempt.candidateInstallationId
            );

            if (!matchedInstallation) {
                await deps.attemptModel.updateOne(
                    { _id: attempt._id },
                    { status: 'failed', oauthCodeVerifier: undefined }
                );
                res.status(403).send(
                    renderErrorPage(
                        'Installation verification failed. The authenticated GitHub user does not have access to this installation.'
                    )
                );
                return;
            }

            await deps.installationModel.findOneAndUpdate(
                { installationId: attempt.candidateInstallationId },
                {
                    installationId: attempt.candidateInstallationId,
                    accountId: matchedInstallation.account?.id ?? 0,
                    accountLogin: (matchedInstallation.account?.login ?? '').toLowerCase(),
                    accountType: matchedInstallation.account?.type === 'Organization' ? 'Organization' : 'User',
                    status: 'active',
                    repositorySelection: matchedInstallation.repository_selection === 'selected' ? 'selected' : 'all',
                    permissions: matchedInstallation.permissions ?? {},
                    events: matchedInstallation.events ?? [],
                },
                { upsert: true, new: true }
            );

            await deps.connectionModel.findOneAndUpdate(
                { guildId: attempt.guildId, installationId: attempt.candidateInstallationId },
                {
                    guildId: attempt.guildId,
                    installationId: attempt.candidateInstallationId,
                    status: 'connected',
                    connectedByDiscordUserId: attempt.initiatedByDiscordUserId,
                },
                { upsert: true, new: true }
            );

            attempt.status = 'consumed';
            attempt.oauthCodeVerifier = undefined;
            await attempt.save();

            res.status(200).send(renderSuccessPage());
        },
    };
}
