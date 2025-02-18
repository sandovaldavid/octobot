import { CommandInteraction } from 'discord.js';
import { RepositoryModel } from '@models/repository';
import { githubValidators } from '@utils/validators';

export const watch = {
    name: 'watch',
    description: 'Watch a GitHub repository for notifications',
    async execute(interaction: CommandInteraction) {
        const repoName = interaction.options.getString('repository');

        if (!githubValidators.isValidRepoUrl(repoName)) {
            return interaction.reply('Invalid repository name format');
        }

        await RepositoryModel.findOneAndUpdate({ name: repoName }, { webhookActive: true }, { new: true });

        await interaction.reply(`Now watching ${repoName} for updates`);
    },
};
