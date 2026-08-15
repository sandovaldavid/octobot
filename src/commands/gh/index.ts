import {
    ApplicationIntegrationType,
    ChatInputCommandInteraction,
    InteractionContextType,
    SlashCommandBuilder,
} from 'discord.js';
import { executeGhDispatcher } from './dispatcher';

export const ghCommand = {
    data: new SlashCommandBuilder()
        .setName('gh')
        .setDescription('GitHub integration and multi-tenant management')
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
                .setDescription('Manage repository subscriptions and status')
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
        )
        // Subcommand Group: issues
        .addSubcommandGroup((group) =>
            group
                .setName('issues')
                .setDescription('Query GitHub issues')
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
        await executeGhDispatcher(interaction, false);
    },
};

export default ghCommand;
