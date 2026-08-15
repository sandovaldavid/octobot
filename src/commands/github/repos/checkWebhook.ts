import { ChatInputCommandInteraction } from 'discord.js';
import { webhookService } from '@services/github/webhookService';
import { githubClient } from '@config/githubConfig';
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
            description: 'Check if a repository has an active webhook configured',
            options: [
                {
                    name: 'name',
                    description: 'Name of the repository to check (e.g. owner/repo or repo)',
                    type: 'string',
                    required: true,
                },
            ],
        },
    },
    async execute(interaction: ChatInputCommandInteraction) {
        try {
            await interaction.deferReply();
            const repoInput = interaction.options.getString('name', true).trim();

            const config = githubClient.getConfig();
            const canonicalFullName = repoInput.includes('/')
                ? repoInput.toLowerCase()
                : `${config.owner.toLowerCase()}/${repoInput.toLowerCase()}`;

            debug.info(`Checking webhook status for repository: ${canonicalFullName}`);

            const result = await webhookService.checkWebhook(canonicalFullName);

            if (!result.success) {
                debug.warn(`Check failed for ${canonicalFullName}: ${result.error}`);
                await interaction.editReply({
                    content: `❌ ${result.error}`,
                    flags: 'SuppressEmbeds',
                });
                return;
            }

            const { exists: hasWebhook, active: isActive, channelId } = result.data || {};

            let message = hasWebhook
                ? `✅ Repository \`${canonicalFullName}\` has a webhook configured in GitHub\n`
                : `❌ Repository \`${canonicalFullName}\` does not have a webhook configured in GitHub\n`;

            if (hasWebhook) {
                message += `Status: ${isActive ? '🟢 Active' : '🔴 Inactive'}\n`;
                if (channelId) {
                    message += `Subscribed Channel: <#${channelId}>`;
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
