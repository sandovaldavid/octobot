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
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('unwatch')
                .setDescription('Stop watching a GitHub repository')
                .addStringOption((option) =>
                    option.setName('repository').setDescription('Name of the repository to unwatch').setRequired(true)
                )
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        const subcommand = interaction.options.getSubcommand();
        const repoName = interaction.options.getString('repository', true);

        try {
            await interaction.deferReply();

            switch (subcommand) {
                case 'watch':
                    await this.handleWatch(interaction, repoName);
                    break;
                case 'unwatch':
                    await this.handleUnwatch(interaction, repoName);
                    break;
            }
        } catch (error) {
            debug.error(`Error in ${subcommand} command:`, error);
            const errorMessage = error.message?.includes('commandRegistry')
                ? '❌ Bot configuration error. Please contact the administrator.'
                : `❌ Failed to ${subcommand} repository. Please try again later.`;

            if (interaction.deferred) {
                await interaction.editReply(errorMessage);
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        }
    },

    async handleWatch(interaction: ChatInputCommandInteraction, repoName: string) {
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
    },

    async handleUnwatch(interaction: ChatInputCommandInteraction, repoName: string) {
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
    },
};
