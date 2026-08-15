import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChatInputCommandInteraction,
    EmbedBuilder,
    InteractionReplyOptions,
} from 'discord.js';
import { DiscordColors } from '@/types/discord';
import { DEFAULT_SUBSCRIPTION_EVENTS, WebhookEventType } from '@/types/webhook';
import { getGitHubAppConfig } from '@config/githubAppConfig';
import { createOnboardingController, GitHubOnboardingController } from '@controllers/githubOnboardingController';
import { DiscordGuildConnectionModel } from '@models/discordGuildConnection';
import { GitHubConnectionAttemptModel } from '@models/githubConnectionAttempt';
import { GitHubInstallationModel } from '@models/githubInstallation';
import { SubscriptionModel } from '@models/subscription';
import { getGitHubClientResolver, IGitHubClientResolver } from '@services/github/githubClientResolver';
import {
    getGitHubInstallationResolver,
    IGitHubInstallationResolver,
} from '@services/github/githubInstallationResolver';
import { verifyCommandAuthorization } from '@services/discord/commandAuthorizationPolicy';
import { decorateResponse } from '@services/discord/commandResponseDecorator';
import {
    MissingCommandPermissionError,
    RepositoryNotAccessibleError,
    toUserFacingErrorMessage,
} from '@/types/multiTenantErrors';
import { debug } from '@utils/logger';

export interface GhCommandDeps {
    installationResolver?: IGitHubInstallationResolver;
    clientResolver?: IGitHubClientResolver;
    onboardingController?: GitHubOnboardingController;
    subscriptionModel?: typeof SubscriptionModel;
    guildConnectionModel?: typeof DiscordGuildConnectionModel;
}

async function sendResponse(interaction: ChatInputCommandInteraction, payload: InteractionReplyOptions): Promise<void> {
    if (interaction.deferred) {
        await interaction.editReply({
            content: payload.content,
            embeds: payload.embeds,
            components: payload.components,
            files: payload.files,
        });
    } else if (!interaction.replied) {
        await interaction.reply(payload);
    }
}

export async function executeGhDispatcher(
    interaction: ChatInputCommandInteraction,
    isDeprecatedNamespace: boolean,
    deps?: GhCommandDeps
): Promise<void> {
    const group = interaction.options.getSubcommandGroup(false);
    const subcommand = interaction.options.getSubcommand(false);

    const resolvedDeps: Required<GhCommandDeps> = {
        installationResolver: deps?.installationResolver ?? getGitHubInstallationResolver(),
        clientResolver: deps?.clientResolver ?? getGitHubClientResolver(),
        onboardingController:
            deps?.onboardingController ??
            createOnboardingController({
                appConfig: getGitHubAppConfig(),
                installationModel: GitHubInstallationModel,
                connectionModel: DiscordGuildConnectionModel,
                attemptModel: GitHubConnectionAttemptModel,
            }),
        subscriptionModel: deps?.subscriptionModel ?? SubscriptionModel,
        guildConnectionModel: deps?.guildConnectionModel ?? DiscordGuildConnectionModel,
    };

    if (!verifyCommandAuthorization(interaction)) {
        const errorMsg = toUserFacingErrorMessage(new MissingCommandPermissionError('Manage Server'));
        const payload = decorateResponse({ content: errorMsg, ephemeral: true }, isDeprecatedNamespace);
        await sendResponse(interaction, payload);
        return;
    }

    try {
        if (!group) {
            switch (subcommand) {
                case 'connect':
                    await handleConnect(interaction, isDeprecatedNamespace, resolvedDeps);
                    return;
                case 'disconnect':
                    await handleDisconnect(interaction, isDeprecatedNamespace, resolvedDeps);
                    return;
                case 'status':
                    await handleStatus(interaction, isDeprecatedNamespace, resolvedDeps);
                    return;
            }
        } else if (group === 'repo') {
            switch (subcommand) {
                case 'watch':
                    await handleRepoWatch(interaction, isDeprecatedNamespace, resolvedDeps);
                    return;
                case 'unwatch':
                    await handleRepoUnwatch(interaction, isDeprecatedNamespace, resolvedDeps);
                    return;
                case 'check':
                case 'check-webhook':
                    await handleRepoCheck(interaction, isDeprecatedNamespace, resolvedDeps);
                    return;
            }
        } else if (group === 'issues') {
            if (subcommand === 'list') {
                await handleIssuesList(interaction, isDeprecatedNamespace, resolvedDeps);
                return;
            }
        }

        debug.warn(`Unknown subcommand route: ${group ? `${group}.${subcommand}` : subcommand}`);
        const invalidPayload = decorateResponse(
            { content: '⚠️ Unknown or unsupported command.', ephemeral: true },
            isDeprecatedNamespace
        );
        await sendResponse(interaction, invalidPayload);
    } catch (error: any) {
        debug.error('Error in executeGhDispatcher:', error);
        const userMsg = toUserFacingErrorMessage(error);
        const payload = decorateResponse({ content: userMsg, ephemeral: true }, isDeprecatedNamespace);
        await sendResponse(interaction, payload);
    }
}

async function handleConnect(
    interaction: ChatInputCommandInteraction,
    isDeprecatedNamespace: boolean,
    deps: Required<GhCommandDeps>
): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) {
        const payload = decorateResponse(
            { content: '⚠️ This command can only be used within a server (Guild).', ephemeral: true },
            isDeprecatedNamespace
        );
        await sendResponse(interaction, payload);
        return;
    }

    const connectUrl = await deps.onboardingController.createConnectUrl(guildId, interaction.user.id);

    const embed = new EmbedBuilder()
        .setTitle('🐙 Connect GitHub App')
        .setDescription(
            `Click the link or button below to install OctoBot on GitHub and link it to this Discord server.\n\n` +
                `🔗 [**Install and Connect OctoBot**](${connectUrl})\n\n` +
                `*Note: This link is single-use and expires in 10 minutes.*`
        )
        .setColor(DiscordColors.INFO);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setLabel('Connect GitHub App').setStyle(ButtonStyle.Link).setURL(connectUrl)
    );

    const payload = decorateResponse(
        {
            embeds: [embed],
            components: [row],
            ephemeral: true,
        },
        isDeprecatedNamespace
    );

    await sendResponse(interaction, payload);
}

async function handleDisconnect(
    interaction: ChatInputCommandInteraction,
    isDeprecatedNamespace: boolean,
    deps: Required<GhCommandDeps>
): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) {
        const payload = decorateResponse(
            { content: '⚠️ This command can only be used within a server (Guild).', ephemeral: true },
            isDeprecatedNamespace
        );
        await sendResponse(interaction, payload);
        return;
    }

    await deps.guildConnectionModel.updateMany({ guildId }, { status: 'disconnected' });

    const payload = decorateResponse(
        {
            content: '🔌 Disconnected all GitHub App installations from this Discord server.',
            ephemeral: true,
        },
        isDeprecatedNamespace
    );

    await sendResponse(interaction, payload);
}

async function handleStatus(
    interaction: ChatInputCommandInteraction,
    isDeprecatedNamespace: boolean,
    deps: Required<GhCommandDeps>
): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) {
        const payload = decorateResponse(
            { content: '⚠️ This command can only be used within a server (Guild).', ephemeral: true },
            isDeprecatedNamespace
        );
        await sendResponse(interaction, payload);
        return;
    }

    const installations = await deps.installationResolver.listForGuild(guildId);
    const subQuery = deps.subscriptionModel.find({ guildId, active: true });
    const subscriptions: any[] =
        typeof (subQuery as any)?.lean === 'function' ? await (subQuery as any).lean() : await subQuery;

    if (installations.length === 0) {
        const embed = new EmbedBuilder()
            .setTitle('🐙 GitHub Integration Status')
            .setDescription(
                '⚠️ No GitHub App installations are connected to this Discord server.\n\n' +
                    'Run `/gh connect` to link your organization or user account.'
            )
            .setColor(DiscordColors.WARNING);

        const payload = decorateResponse({ embeds: [embed] }, isDeprecatedNamespace);
        await sendResponse(interaction, payload);
        return;
    }

    const embed = new EmbedBuilder().setTitle('🐙 GitHub Integration Status').setColor(DiscordColors.SUCCESS);

    const instLines = installations
        .map(
            (inst) =>
                `• **${inst.accountLogin}** (${inst.accountType}) — ID: \`${inst.installationId}\` [Status: \`${inst.status}\`]`
        )
        .join('\n');
    embed.addFields({ name: 'Connected GitHub Installations', value: instLines || 'None' });

    if (subscriptions.length > 0) {
        const subLines = subscriptions
            .slice(0, 10)
            .map(
                (sub: any) =>
                    `• **${sub.repositoryFullName}** → <#${sub.channelId}> \`[${(sub.events || []).join(', ')}]\``
            )
            .join('\n');
        const suffix = subscriptions.length > 10 ? `\n*...and ${subscriptions.length - 10} more*` : '';
        embed.addFields({
            name: `Active Channel Subscriptions (${subscriptions.length})`,
            value: subLines + suffix,
        });
    } else {
        embed.addFields({
            name: 'Active Channel Subscriptions',
            value: 'No channels are currently watching any repositories.\nUse `/gh repo watch` to subscribe this channel.',
        });
    }

    const payload = decorateResponse({ embeds: [embed] }, isDeprecatedNamespace);
    await sendResponse(interaction, payload);
}

async function handleRepoWatch(
    interaction: ChatInputCommandInteraction,
    isDeprecatedNamespace: boolean,
    deps: Required<GhCommandDeps>
): Promise<void> {
    const guildId = interaction.guildId;
    const channelId = interaction.channelId;

    if (!guildId) {
        const payload = decorateResponse(
            { content: '⚠️ This command can only be used within a server (Guild).', ephemeral: true },
            isDeprecatedNamespace
        );
        await sendResponse(interaction, payload);
        return;
    }

    await interaction.deferReply();

    const repoInput = interaction.options.getString('name', true).trim();
    const eventsOption = interaction.options.getString('events')?.trim();
    const events: WebhookEventType[] = eventsOption
        ? (eventsOption.split(',').map((e) => e.trim()) as WebhookEventType[])
        : [...DEFAULT_SUBSCRIPTION_EVENTS];

    const installation = await deps.installationResolver.resolveForGuild(guildId, repoInput);
    const octokit = await deps.clientResolver.forInstallation(installation.installationId);

    let owner: string;
    let repo: string;
    if (repoInput.includes('/')) {
        const parts = repoInput.split('/');
        owner = parts[0].trim();
        repo = parts[1].trim();
    } else {
        owner = installation.accountLogin;
        repo = repoInput.trim();
    }

    let repoData: any;
    try {
        const { data } = await octokit.rest.repos.get({ owner, repo });
        repoData = data;
    } catch (err: any) {
        if (err.status === 404 || err.message?.toLowerCase().includes('not found')) {
            throw new RepositoryNotAccessibleError(`${owner}/${repo}`, installation.installationId);
        }
        throw err;
    }

    const canonicalFullName = repoData.full_name.toLowerCase();

    await deps.subscriptionModel.findOneAndUpdate(
        {
            installationId: installation.installationId,
            repositoryId: repoData.id,
            guildId,
            channelId,
        },
        {
            repositoryId: repoData.id,
            repositoryFullName: canonicalFullName,
            installationId: installation.installationId,
            guildId,
            channelId,
            events,
            active: true,
            createdByDiscordUserId: interaction.user.id,
        },
        { upsert: true, new: true }
    );

    const embed = new EmbedBuilder()
        .setTitle('✅ Repository Watch Configured')
        .setDescription(
            `Now watching **[${canonicalFullName}](${repoData.html_url || `https://github.com/${canonicalFullName}`})** in <#${channelId}>.\n\n` +
                `**Events:** \`${events.join(', ')}\`\n` +
                `**Installation:** @${installation.accountLogin} (#${installation.installationId})`
        )
        .setColor(DiscordColors.SUCCESS);

    const payload = decorateResponse({ embeds: [embed] }, isDeprecatedNamespace);
    await sendResponse(interaction, payload);
}

async function handleRepoUnwatch(
    interaction: ChatInputCommandInteraction,
    isDeprecatedNamespace: boolean,
    deps: Required<GhCommandDeps>
): Promise<void> {
    const guildId = interaction.guildId;
    const channelId = interaction.channelId;

    if (!guildId) {
        const payload = decorateResponse(
            { content: '⚠️ This command can only be used within a server (Guild).', ephemeral: true },
            isDeprecatedNamespace
        );
        await sendResponse(interaction, payload);
        return;
    }

    await interaction.deferReply();

    const repoInput = interaction.options.getString('name', true).trim().toLowerCase();
    const searchPattern = repoInput.includes('/') ? repoInput : new RegExp(`^(.*\\/)?${repoInput}$`, 'i');

    const sub = await deps.subscriptionModel.findOneAndUpdate(
        {
            guildId,
            channelId,
            repositoryFullName: typeof searchPattern === 'string' ? searchPattern : { $regex: searchPattern },
            active: true,
        },
        { active: false },
        { new: true }
    );

    if (!sub) {
        const payload = decorateResponse(
            {
                content: `⚠️ Repository \`${repoInput}\` is not currently being watched in <#${channelId}>.`,
            },
            isDeprecatedNamespace
        );
        await sendResponse(interaction, payload);
        return;
    }

    const payload = decorateResponse(
        {
            content: `✅ Stopped watching \`${sub.repositoryFullName}\` in <#${channelId}>.`,
        },
        isDeprecatedNamespace
    );
    await sendResponse(interaction, payload);
}

async function handleRepoCheck(
    interaction: ChatInputCommandInteraction,
    isDeprecatedNamespace: boolean,
    deps: Required<GhCommandDeps>
): Promise<void> {
    const guildId = interaction.guildId;
    const channelId = interaction.channelId;

    if (!guildId) {
        const payload = decorateResponse(
            { content: '⚠️ This command can only be used within a server (Guild).', ephemeral: true },
            isDeprecatedNamespace
        );
        await sendResponse(interaction, payload);
        return;
    }

    await interaction.deferReply();

    const repoInput = interaction.options.getString('name', true).trim();

    const connQuery = deps.guildConnectionModel.find({ guildId, status: 'connected' });
    const connections: any[] =
        typeof (connQuery as any)?.lean === 'function' ? await (connQuery as any).lean() : await connQuery;

    let installation: any = null;
    let instError: any = null;
    try {
        installation = await deps.installationResolver.resolveForGuild(guildId, repoInput);
    } catch (err) {
        instError = err;
    }

    let repoData: any = null;
    let repoError: any = null;
    if (installation) {
        try {
            const octokit = await deps.clientResolver.forInstallation(installation.installationId);
            let owner: string;
            let repo: string;
            if (repoInput.includes('/')) {
                const parts = repoInput.split('/');
                owner = parts[0].trim();
                repo = parts[1].trim();
            } else {
                owner = installation.accountLogin;
                repo = repoInput.trim();
            }
            const { data } = await octokit.rest.repos.get({ owner, repo });
            repoData = data;
        } catch (err: any) {
            repoError = err;
        }
    }

    const canonicalFullName = repoData ? repoData.full_name.toLowerCase() : repoInput.toLowerCase();
    const subQuery = deps.subscriptionModel.findOne({
        guildId,
        channelId,
        repositoryFullName: { $regex: new RegExp(`^(${canonicalFullName}|.+/${canonicalFullName})$`, 'i') },
        active: true,
    });
    const subscription =
        typeof (subQuery as any)?.lean === 'function' ? await (subQuery as any).lean() : await subQuery;

    const isHealthy = Boolean(connections.length > 0 && installation && repoData && subscription);

    const embed = new EmbedBuilder()
        .setTitle(`🔍 Health Check: ${repoInput}`)
        .setColor(isHealthy ? DiscordColors.SUCCESS : DiscordColors.WARNING);

    embed.addFields(
        {
            name: '1. Discord Server Connection',
            value:
                connections.length > 0
                    ? `✅ Connected (${connections.length} active installation${connections.length > 1 ? 's' : ''})`
                    : '❌ Not connected. Run `/gh connect`',
        },
        {
            name: '2. GitHub App Installation',
            value: installation
                ? `✅ Active (ID: \`${installation.installationId}\`, Org/User: **${installation.accountLogin}**)`
                : `❌ ${instError ? toUserFacingErrorMessage(instError) : 'No installation found'}`,
        },
        {
            name: '3. GitHub Repository Access',
            value: repoData
                ? `✅ Accessible (ID: \`${repoData.id}\`, Default branch: \`${repoData.default_branch}\`)`
                : `❌ ${repoError ? toUserFacingErrorMessage(repoError) : 'Cannot access repository'}`,
        },
        {
            name: '4. Channel Subscription',
            value: subscription
                ? `✅ Active in <#${channelId}> (Events: \`${(subscription.events || []).join(', ')}\`)`
                : `⚠️ Not subscribed in this channel. Run \`/gh repo watch name:${repoInput}\``,
        },
        {
            name: 'Overall Integration Status',
            value: isHealthy ? '🟢 **Healthy & Ready**' : '🟡 **Action Required**',
        }
    );

    const payload = decorateResponse({ embeds: [embed] }, isDeprecatedNamespace);
    await sendResponse(interaction, payload);
}

async function handleIssuesList(
    interaction: ChatInputCommandInteraction,
    isDeprecatedNamespace: boolean,
    deps: Required<GhCommandDeps>
): Promise<void> {
    const guildId = interaction.guildId;

    if (!guildId) {
        const payload = decorateResponse(
            { content: '⚠️ This command can only be used within a server (Guild).', ephemeral: true },
            isDeprecatedNamespace
        );
        await sendResponse(interaction, payload);
        return;
    }

    const repoInput = interaction.options.getString('repo', true).trim();
    const state = (interaction.options.getString('state') || 'open') as 'open' | 'closed' | 'all';
    const limit = interaction.options.getInteger('limit') || 5;

    const installation = await deps.installationResolver.resolveForGuild(guildId, repoInput);
    const octokit = await deps.clientResolver.forInstallation(installation.installationId);

    let owner: string;
    let repo: string;
    if (repoInput.includes('/')) {
        const parts = repoInput.split('/');
        owner = parts[0].trim();
        repo = parts[1].trim();
    } else {
        owner = installation.accountLogin;
        repo = repoInput.trim();
    }

    const repoFullName = `${owner}/${repo}`;

    // Restrict issue listing to repositories actively watched in this Discord guild under this installation
    const subscription = await deps.subscriptionModel.findOne({
        guildId,
        installationId: installation.installationId,
        repositoryFullName: repoFullName,
        active: true,
    });

    if (!subscription) {
        const payload = decorateResponse(
            {
                content: `⚠️ OctoBot is not watching **${repoFullName}** in this server. An administrator must run \`/gh repo watch\` first.`,
            },
            isDeprecatedNamespace
        );
        await sendResponse(interaction, payload);
        return;
    }

    await interaction.deferReply();

    const { data } = await octokit.rest.issues.listForRepo({
        owner,
        repo,
        state,
        per_page: Math.min(Math.max(limit, 1), 25) + 5,
        sort: 'updated',
        direction: 'desc',
    });

    const issues = (data || []).filter((issue: any) => !issue.pull_request).slice(0, limit);

    const stateTitle = state.charAt(0).toUpperCase() + state.slice(1);
    const embed = new EmbedBuilder()
        .setTitle(`${stateTitle} Issues — ${owner}/${repo}`)
        .setColor(
            state === 'open'
                ? DiscordColors.ISSUE_OPEN
                : state === 'closed'
                  ? DiscordColors.ISSUE_CLOSED
                  : DiscordColors.DEFAULT
        );

    if (issues.length === 0) {
        embed.setDescription(`No ${state} issues found in \`${owner}/${repo}\`.`);
    } else {
        embed.addFields(
            issues.map((issue: any) => ({
                name: `#${issue.number} — ${issue.title.slice(0, 200)}`,
                value: `State: \`${issue.state}\` • Author: **${issue.user?.login || 'unknown'}** • [View on GitHub](${issue.html_url})`,
            }))
        );
    }

    const payload = decorateResponse({ embeds: [embed] }, isDeprecatedNamespace);
    await sendResponse(interaction, payload);
}
