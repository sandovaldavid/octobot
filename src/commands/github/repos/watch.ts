import { ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { RepositorySubscriptionModel } from '@models/subscription';
import { webhookService } from '@services/github/webhookService';
import { debug } from '@utils/logger';
import { createCommand } from '@utils/commandBuilder';
import { WEBHOOK_EVENTS } from '../../../types/webhook';

export const watch = createCommand({
    name: 'github',
    description: 'GitHub commands',
    subcommandGroup: {
        name: 'repo',
        description: 'Repository management commands',
        subcommand: {
            name: 'watch',
            description: 'Watch a GitHub repository and route notifications to this channel',
            options: [
                {
                    name: 'name',
                    description: 'Name of the repository to watch (e.g. owner/repo or repo)',
                    type: 'string',
                    required: true,
                },
            ],
        },
    },
    async execute(interaction: ChatInputCommandInteraction) {
        try {
            const memberPermissions = interaction.memberPermissions;
            const hasAdminPermission =
                memberPermissions?.has(PermissionFlagsBits.Administrator) ||
                memberPermissions?.has(PermissionFlagsBits.ManageGuild);

            if (!hasAdminPermission) {
                await interaction.reply({
                    content: '🚫 You need **Administrator** or **Manage Server** permissions to execute this command.',
                    ephemeral: true,
                });
                return;
            }

            await interaction.deferReply();
            const repoName = interaction.options.getString('name', true);
            const channelId = interaction.channelId;
            const guildId = interaction.guildId || undefined;

            debug.info(`Attempting to watch repository: ${repoName} in channel: ${channelId}`);

            const webhookResult = await webhookService.configureWebhook(repoName);
            if (!webhookResult.success) {
                const errorMessage = webhookResult.error?.includes('does not exist')
                    ? `❌ Repository \`${repoName}\` does not exist. Please check the name and try again.`
                    : webhookResult.error?.includes('permission')
                      ? `❌ No permission to configure webhooks for \`${repoName}\`. Make sure you have admin access.`
                      : `❌ Failed to configure webhook: ${webhookResult.error}`;

                await interaction.editReply(errorMessage);
                return;
            }

            await RepositorySubscriptionModel.findOneAndUpdate(
                {
                    repositoryFullName: repoName.toLowerCase(),
                    channelId: channelId,
                },
                {
                    repositoryFullName: repoName.toLowerCase(),
                    guildId,
                    channelId,
                    events: WEBHOOK_EVENTS,
                    active: true,
                },
                { upsert: true, new: true }
            );

            debug.info(`Successfully configured subscription for ${repoName} in channel ${channelId}`);
            await interaction.editReply(`✅ Now watching \`${repoName}\` for updates in <#${channelId}>`);
        } catch (error) {
            debug.error('Error in watch command:', error);
            const errorMessage = '❌ Failed to watch repository. Please try again later.';

            if (interaction.deferred) {
                await interaction.editReply(errorMessage);
            } else if (!interaction.replied) {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        }
    },
});
