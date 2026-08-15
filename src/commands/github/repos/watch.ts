import { ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { RepositorySubscriptionModel } from '@models/subscription';
import { webhookService } from '@services/github/webhookService';
import { githubClient } from '@config/githubConfig';
import { debug } from '@utils/logger';
import { createCommand } from '@utils/commandBuilder';
import { DEFAULT_SUBSCRIPTION_EVENTS } from '../../../types/webhook';

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
            const repoInput = interaction.options.getString('name', true).trim();
            const channelId = interaction.channelId;
            const guildId = interaction.guildId || undefined;

            const config = githubClient.getConfig();
            const canonicalFullName = repoInput.includes('/')
                ? repoInput.toLowerCase()
                : `${config.owner.toLowerCase()}/${repoInput.toLowerCase()}`;

            debug.info(`Attempting to watch repository: ${canonicalFullName} in channel: ${channelId}`);

            const webhookResult = await webhookService.configureWebhook(canonicalFullName);
            if (!webhookResult.success) {
                const errorMessage = webhookResult.error?.includes('does not exist')
                    ? `❌ Repository \`${canonicalFullName}\` does not exist. Please check the name and try again.`
                    : webhookResult.error?.includes('permission')
                      ? `❌ No permission to configure webhooks for \`${canonicalFullName}\`. Make sure you have admin access.`
                      : `❌ Failed to configure webhook: ${webhookResult.error}`;

                await interaction.editReply(errorMessage);
                return;
            }

            await RepositorySubscriptionModel.findOneAndUpdate(
                {
                    repositoryFullName: canonicalFullName,
                    channelId: channelId,
                },
                {
                    repositoryFullName: canonicalFullName,
                    guildId,
                    channelId,
                    events: DEFAULT_SUBSCRIPTION_EVENTS,
                    active: true,
                },
                { upsert: true, new: true }
            );

            debug.info(`Successfully configured subscription for ${canonicalFullName} in channel ${channelId}`);
            await interaction.editReply(`✅ Now watching \`${canonicalFullName}\` for updates in <#${channelId}>`);
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
