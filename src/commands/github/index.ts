import {
    ApplicationIntegrationType,
    ChatInputCommandInteraction,
    InteractionContextType,
    MessageFlags,
    SlashCommandBuilder,
} from 'discord.js';
import { validateEnv } from '@config/envConfig';
import { executeGhDispatcher } from '../gh/dispatcher';
import { watch } from './repos/watch';
import { unwatch } from './repos/unwatch';
import { checkWebhook } from './repos/checkWebhook';
import { list } from './issues/list';

export const github = {
    data: new SlashCommandBuilder()
        .setName('github')
        .setDescription('[Deprecated] GitHub workflow assistant commands. Use /gh instead.')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
        // Subcommand: connect
        .addSubcommand((subcommand) =>
            subcommand
                .setName('connect')
                .setDescription('Link your GitHub organization or user account to this Discord server')
        )
        // Subcommand: disconnect
        .addSubcommand((subcommand) =>
            subcommand
                .setName('disconnect')
                .setDescription('Disconnect GitHub App installations from this Discord server')
        )
        // Subcommand: status
        .addSubcommand((subcommand) =>
            subcommand
                .setName('status')
                .setDescription('Show active GitHub App installations and subscriptions for this server')
        )
        // Subcommand Group: repo
        .addSubcommandGroup((group) =>
            group
                .setName('repo')
                .setDescription('Repository subscription and health commands')
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('watch')
                        .setDescription('Watch a GitHub repository and route notifications to this channel')
                        .addStringOption((option) =>
                            option
                                .setName('name')
                                .setDescription('Repository name (e.g. owner/repo or repo)')
                                .setRequired(true)
                        )
                        .addStringOption((option) =>
                            option
                                .setName('events')
                                .setDescription('Comma-separated events to watch (e.g. issues,pull_request,push)')
                                .setRequired(false)
                        )
                )
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('unwatch')
                        .setDescription('Stop watching a GitHub repository in this channel')
                        .addStringOption((option) =>
                            option
                                .setName('name')
                                .setDescription('Repository name (e.g. owner/repo or repo)')
                                .setRequired(true)
                        )
                )
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('check')
                        .setDescription('Composite health check for a repository integration')
                        .addStringOption((option) =>
                            option
                                .setName('name')
                                .setDescription('Repository name (e.g. owner/repo or repo)')
                                .setRequired(true)
                        )
                )
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('check-webhook')
                        .setDescription('Check if a repository has an active webhook configured')
                        .addStringOption((option) =>
                            option
                                .setName('name')
                                .setDescription('Repository name (e.g. owner/repo or repo)')
                                .setRequired(true)
                        )
                )
        )
        // Subcommand Group: issues
        .addSubcommandGroup((group) =>
            group
                .setName('issues')
                .setDescription('Issue query commands')
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('list')
                        .setDescription('List issues from a GitHub repository')
                        .addStringOption((option) =>
                            option
                                .setName('repo')
                                .setDescription('Repository name (e.g. owner/repo or repo)')
                                .setRequired(true)
                        )
                        .addStringOption((option) =>
                            option
                                .setName('state')
                                .setDescription('Filter issues by state (open/closed/all)')
                                .addChoices(
                                    { name: 'Open', value: 'open' },
                                    { name: 'Closed', value: 'closed' },
                                    { name: 'All', value: 'all' }
                                )
                                .setRequired(false)
                        )
                        .addIntegerOption((option) =>
                            option
                                .setName('limit')
                                .setDescription('Maximum number of issues to fetch')
                                .setRequired(false)
                        )
                )
        ),

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        let authMode: 'github_app' | 'legacy_pat' = 'github_app';
        try {
            const env = validateEnv();
            authMode = env.authMode;
        } catch {
            authMode = process.env.GITHUB_TOKEN && !process.env.GITHUB_APP_ID ? 'legacy_pat' : 'github_app';
        }

        if (authMode === 'github_app') {
            await executeGhDispatcher(interaction, true);
            return;
        }

        // Legacy PAT Mode dispatching
        const group = interaction.options.getSubcommandGroup(false);
        const subcommand = interaction.options.getSubcommand(false);

        if (group === 'repo') {
            if (subcommand === 'watch') return watch.execute(interaction);
            if (subcommand === 'unwatch') return unwatch.execute(interaction);
            if (subcommand === 'check-webhook' || subcommand === 'check') return checkWebhook.execute(interaction);
        } else if (group === 'issues') {
            if (subcommand === 'list') return list.execute(interaction);
        }

        await interaction.reply({
            content:
                '⚠️ This command is only supported in GitHub App mode. Please upgrade your deployment to use GitHub App.',
            flags: MessageFlags.Ephemeral,
        });
    },
};

export default github;
