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
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        const group = interaction.options.getSubcommandGroup();
        const subcommand = interaction.options.getSubcommand();

        try {
            switch (group) {
                case 'repo':
                    const command = repoCommands[subcommand as keyof typeof repoCommands];
                    if (command) {
                        await command.execute(interaction);
                    }
                    break;
            }
        } catch (error) {
            debug.error(`Error executing command: ${error}`);
            await interaction.reply({
                content: 'There was an error executing this command!',
                ephemeral: true,
            });
        }
    },
};
