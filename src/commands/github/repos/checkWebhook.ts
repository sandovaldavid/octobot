import { ChatInputCommandInteraction } from 'discord.js';
import { webhookService } from '@services/github/webhookService';
import { debug } from '@utils/logger';

export const checkWebhook = {
    async execute(interaction: ChatInputCommandInteraction) {
        try {
            await interaction.deferReply();
            const repoName = interaction.options.getString('name', true);

            debug.info(`Checking webhook status for repository: ${repoName}`);
            await interaction.editReply('🔍 Checking webhook status...');

            const result = await webhookService.checkWebhook(repoName);

            if (!result.success) {
                debug.error('Check failed:', result.error);
                return interaction.editReply(`❌ Error checking webhook: ${result.error}`);
            }

            const hasWebhook = result.data?.exists;
            const isActive = result.data?.active;
            const channelId = result.data?.channelId;

            let message = hasWebhook
                ? `✅ Repository \`${repoName}\` has a webhook configured\n`
                : `❌ Repository \`${repoName}\` does not have a webhook configured\n`;

            if (hasWebhook) {
                message += `Status: ${isActive ? '🟢 Active' : '🔴 Inactive'}\n`;
                if (channelId) {
                    message += `Channel: <#${channelId}>`;
                }
            }

            await interaction.editReply(message);
        } catch (error) {
            debug.error('Error in check-webhook command:', error);
            if (interaction.deferred) {
                await interaction.editReply('❌ Failed to check webhook status. Please try again later.');
            } else {
                await interaction.reply({
                    content: '❌ Failed to check webhook status. Please try again later.',
                    flags: 64,
                });
            }
        }
    },
};
