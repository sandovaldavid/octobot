import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import * as repoCommands from './repos';
import { debug } from '@utils/logger';

export const github = {
    data: new SlashCommandBuilder()
        .setName('github')
        .setDescription('GitHub management commands')
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
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        const group = interaction.options.getSubcommandGroup();
        const subcommand = interaction.options.getSubcommand();

        try {
            if (group === 'repo') {
                const handler = repoCommands.handlers[subcommand];
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
            debug.error(`Error executing command: ${error}`);
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
