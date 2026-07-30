import { ChatInputCommandInteraction } from 'discord.js';
import { webhookService } from '@services/github/webhookService';
import { debug } from '@utils/logger';
import { createCommand } from '@utils/commandBuilder';

export const checkWebhook = createCommand({
    name: 'github',
    description: 'GitHub commands',
    subcommandGroup: {
        name: 'repo',
        description: 'Repository management commands',
        subcommand: {
            name: 'check-webhook',
            description: 'Check if a repository has an active webhook',
            options: [
                {
                    name: 'name',
                    description: 'Name of the repository to check',
                    type: 'string',
                    required: true,
                },
            ],
        },
    },
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
                    flags: 'SuppressEmbeds',
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
                flags: 'SuppressEmbeds',
            });
        } catch (error) {
            debug.error('Error in check-webhook command:', error);

            try {
                if (interaction.deferred) {
                    await interaction.editReply({
                        content: '❌ Failed to check webhook status. Please try again later.',
                        flags: 'SuppressEmbeds',
                    });
                }
            } catch (replyError) {
                debug.error('Error sending error response:', replyError);
            }
        }
    },
});
