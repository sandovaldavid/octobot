import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { RepositoryModel } from '@models/repository';
import { webhookService } from '@services/github/webhookService';
import { debug } from '@utils/logger';
import { WEBHOOK_EVENTS } from '../../../types/webhookTypes';

export const watch = {
    data: new SlashCommandBuilder()
        .setName('github')
        .setDescription('GitHub repository commands')
        .addSubcommand((subcommand) =>
            subcommand
                .setName('watch')
                .setDescription('Watch a GitHub repository')
                .addStringOption((option) =>
                    option.setName('name').setDescription('Name of the repository to watch').setRequired(true)
                )
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        try {
            await interaction.deferReply();
            const repoName = interaction.options.getString('name', true);
            const channelId = interaction.channelId;

            debug.info(`Attempting to watch repository: ${repoName} in channel: ${channelId}`);

            const webhookResult = await webhookService.configureWebhook(repoName);
            if (!webhookResult.success) {
                const errorMessage = webhookResult.error?.includes('does not exist')
                    ? `❌ Repository \`${repoName}\` does not exist. Please check the name and try again.`
                    : webhookResult.error?.includes('permission')
                      ? `❌ No permission to configure webhooks for \`${repoName}\`. Make sure you have admin access.`
                      : `❌ Failed to configure webhook: ${webhookResult.error}`;

                return interaction.editReply(errorMessage);
            }

            await RepositoryModel.findOneAndUpdate(
                { name: repoName },
                {
                    webhookActive: true,
                    webhookSettings: {
                        events: WEBHOOK_EVENTS,
                        channelId: channelId,
                    },
                },
                { upsert: true }
            );

            debug.info(`Successfully configured webhook for ${repoName} in channel ${channelId}`);
            await interaction.editReply(`✅ Now watching \`${repoName}\` for updates in <#${channelId}>`);
        } catch (error) {
            debug.error('Error in watch command:', error);
            const errorMessage = '❌ Failed to watch repository. Please try again later.';

            if (interaction.deferred) {
                await interaction.editReply(errorMessage);
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        }
    },
};
