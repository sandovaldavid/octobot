import { ChatInputCommandInteraction } from 'discord.js';
import { webhookService } from '@services/github/webhookService';
import { debug } from '@utils/logger';

export const checkWebhook = {
    async execute(interaction: ChatInputCommandInteraction) {
        try {
            await interaction.deferReply();
            const repoName = interaction.options.getString('name', true);

            debug.info(`Checking webhook status for repository: ${repoName}`);

            const result = await webhookService.checkWebhook(repoName);

            if (!result.success) {
                debug.warn(`Check failed for ${repoName}: ${result.error}`);
                await interaction.editReply({
                    content: `❌ ${result.error}`,
                    flags: 64,
                });
                return;
            }

            const { exists: hasWebhook, active: isActive, channelId } = result.data || {};

            let message = hasWebhook
                ? `✅ Repository \`${repoName}\` has a webhook configured\n`
                : `❌ Repository \`${repoName}\` does not have a webhook configured\n`;

            if (hasWebhook) {
                message += `Status: ${isActive ? '🟢 Active' : '🔴 Inactive'}\n`;
                if (channelId) {
                    message += `Channel: <#${channelId}>`;
                }
            }

            await interaction.editReply({
                content: message,
                flags: 64,
            });
        } catch (error) {
            debug.error('Error in check-webhook command:', error);

            try {
                if (interaction.deferred) {
                    await interaction.editReply({
                        content: '❌ Failed to check webhook status. Please try again later.',
                        flags: 64,
                    });
                }
            } catch (replyError) {
                debug.error('Error sending error response:', replyError);
            }
        }
    },
};
