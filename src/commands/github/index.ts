import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';

type RepoSubcommands = 'watch' | 'unwatch' | 'sync' | 'check-webhook';
type IssueSubcommands = 'list';
import * as repoCommands from './repos';
import * as issueCommands from './issues';
import { debug } from '@utils/logger';

export const github = {
    data: new SlashCommandBuilder()
        .setName('github')
        .setDescription('GitHub management commands')
        // Repository commands group
        .addSubcommandGroup((group) =>
            group
                .setName('repo')
                .setDescription('Repository management commands')
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('watch')
                        .setDescription('Watch a repository')
                        .addStringOption((option) =>
                            option.setName('name').setDescription('Repository name').setRequired(true)
                        )
                )
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('unwatch')
                        .setDescription('Unwatch a repository')
                        .addStringOption((option) =>
                            option.setName('name').setDescription('Repository name').setRequired(true)
                        )
                )
                .addSubcommand((subcommand) => subcommand.setName('sync').setDescription('Sync repositories'))
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('check-webhook')
                        .setDescription('Check if a repository has an active webhook')
                        .addStringOption((option) =>
                            option.setName('name').setDescription('Name of the repository to check').setRequired(true)
                        )
                )
        )
        // Issues commands group
        .addSubcommandGroup((group) =>
            group
                .setName('issues')
                .setDescription('Issue management commands')
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('list')
                        .setDescription('List all issues')
                        .addStringOption((option) =>
                            option
                                .setName('state')
                                .setDescription('Filter issues by state')
                                .addChoices(
                                    { name: 'Open', value: 'open' },
                                    { name: 'Closed', value: 'closed' },
                                    { name: 'All', value: 'all' }
                                )
                                .setRequired(false)
                        )
                        .addStringOption((option) =>
                            option.setName('repo').setDescription('Filter by repository').setRequired(false)
                        )
                )
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        const group = interaction.options.getSubcommandGroup();
        const subcommand = interaction.options.getSubcommand();
                const handler = repoCommands.handlers[subcommand as RepoSubcommands];
        try {
            if (group === 'repo') {
                const handler = repoCommands.handlers[subcommand as RepoSubcommands];
                if (handler) {
                    await handler(interaction);
                    return;
                }
            } else if (group === 'issues') {
                const handler = issueCommands.handlers[subcommand as IssueSubcommands];
                if (handler) {
                    await handler(interaction);
                    return;
                }
            }

            debug.warn(`Invalid command group/subcommand: ${group}/${subcommand}`);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'Invalid command. Please try again.',
                    flags: 64,
                });
            }
        } catch (error) {
            debug.error(`Error executing command:`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'There was an error executing this command!',
                    flags: 64,
                });
            } else if (interaction.deferred && !interaction.replied) {
                await interaction.editReply({
                    content: 'There was an error executing this command!',
                });
            }
        }
    },
};
