import { CommandInteraction, SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
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
                    option.setName('repository').setDescription('Name of the repository to watch').setRequired(true)
                )
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        const subcommand = interaction.options.getSubcommand();
        if (subcommand !== 'watch') return;

        try {
            await interaction.deferReply();
            const repoName = interaction.options.getString('repository', true);

            debug.info(`Attempting to watch repository: ${repoName}`);

            // Configure webhook
            const webhookResult = await webhookService.configureWebhook(repoName);
            if (!webhookResult.success) {
                const errorMessage = webhookResult.error?.includes('does not exist')
                    ? `❌ Repository \`${repoName}\` does not exist. Please check the name and try again.`
                    : webhookResult.error?.includes('permission')
                      ? `❌ No permission to configure webhooks for \`${repoName}\`. Make sure you have admin access.`
                      : `❌ Failed to configure webhook: ${webhookResult.error}`;

                return interaction.editReply(errorMessage);
            }

            // Update repository in database
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
            const errorMessage = error.message?.includes('commandRegistry')
                ? '❌ Bot configuration error. Please contact the administrator.'
                : '❌ Failed to configure repository webhook. Please try again later.';

            if (interaction.deferred) {
                await interaction.editReply(errorMessage);
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        }
    },
};
