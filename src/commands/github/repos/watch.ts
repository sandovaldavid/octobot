import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { RepositoryModel } from '@models/repository';
import { webhookService } from '@services/github/webhookService';
import { debug } from '@utils/logger';

export const watch = {
    data: new SlashCommandBuilder()
        .setName('github')
        .setDescription('GitHub repository commands')
        .addSubcommand((subcommand) =>
            subcommand
                .setName('watch')
                .setDescription('Watch a GitHub repository for notifications')
                .addStringOption((option) =>
                    option
                        .setName('name')
                        .setDescription('Name of the repository to watch')
                        .setRequired(true)
                )
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        try {
            await interaction.deferReply();
            const repoName = interaction.options.getString('name', true);

            debug.info(`Attempting to watch repository: ${repoName}`);

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
                        events: ['push', 'pull_request', 'issues', 'release', 'create', 'delete'],
                        channelId: interaction.channelId,
                    },
                },
                { upsert: true }
            );

            debug.info(`Successfully configured webhook for ${repoName} in channel ${interaction.channelId}`);
            await interaction.editReply(`✅ Now watching \`${repoName}\` for updates in this channel`);
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
