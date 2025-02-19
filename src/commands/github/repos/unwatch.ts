import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { RepositoryModel } from '@models/repository';
import { webhookService } from '@services/github/webhookService';
import { debug } from '@utils/logger';

export const unwatch = {
    data: new SlashCommandBuilder()
        .setName('github')
        .setDescription('GitHub repository commands')
        .addSubcommand((subcommand) =>
            subcommand
                .setName('unwatch')
                .setDescription('Stop watching a GitHub repository')
                .addStringOption((option) =>
                    option.setName('repository').setDescription('Name of the repository to unwatch').setRequired(true)
                )
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        try {
            await interaction.deferReply();
            const repoName = interaction.options.getString('repository', true);

            debug.info(`Attempting to unwatch repository: ${repoName}`);

            const repository = await RepositoryModel.findOne({ name: repoName });
            if (!repository) {
                return interaction.editReply(`❌ Repository \`${repoName}\` is not being watched`);
            }

            // Remove webhook from GitHub
            const unwatchResult = await webhookService.removeWebhook(repoName);
            if (!unwatchResult.success) {
                debug.error(`Failed to remove webhook: ${unwatchResult.error}`);
            }

            // Update database
            await RepositoryModel.findOneAndUpdate(
                { name: repoName },
                {
                    webhookActive: false,
                    $unset: { webhookSettings: '' },
                }
            );

            debug.info(`Successfully unwatched repository ${repoName}`);
            await interaction.editReply(`✅ Stopped watching \`${repoName}\``);
        } catch (error) {
            debug.error('Error in unwatch command:', error);
            const errorMessage = '❌ Failed to unwatch repository. Please try again later.';

            if (interaction.deferred) {
                await interaction.editReply(errorMessage);
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        }
    },
};
