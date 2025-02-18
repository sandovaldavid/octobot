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
        if (!interaction.isCommand()) return;

        const subcommand = interaction.options.getSubcommand();
        if (subcommand !== 'watch') return;

        try {
            await interaction.deferReply();
            const repoName = interaction.options.getString('repository', true);

            debug.info(`Attempting to watch repository: ${repoName}`);

            // Configure webhook
            const webhookResult = await webhookService.configureWebhook(repoName);
            if (!webhookResult.success) {
                debug.error(`Failed to configure webhook: ${webhookResult.error}`);
                return interaction.editReply(`❌ Failed to configure webhook: ${webhookResult.error}`);
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
            await interaction.editReply('❌ Failed to configure repository webhook. Check logs for details.');
        }
    },
};
