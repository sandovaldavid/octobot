import { ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { RepositorySubscriptionModel } from '@models/subscription';
import { webhookService } from '@services/github/webhookService';
import { debug } from '@utils/logger';
import { createCommand } from '@utils/commandBuilder';

export const unwatch = createCommand({
    name: 'github',
    description: 'GitHub commands',
    subcommandGroup: {
        name: 'repo',
        description: 'Repository management commands',
        subcommand: {
            name: 'unwatch',
            description: 'Stop watching a GitHub repository in this channel',
            options: [
                {
                    name: 'name',
                    description: 'Name of the repository to unwatch',
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

            debug.info(`Attempting to unwatch repository: ${repoName} in channel: ${channelId}`);

            const subscription = await RepositorySubscriptionModel.findOne({
                repositoryFullName: repoName.toLowerCase(),
                channelId,
                active: true,
            });

            if (!subscription) {
                await interaction.editReply(`❌ Repository \`${repoName}\` is not being watched in <#${channelId}>.`);
                return;
            }

            // Remove subscription from database
            await RepositorySubscriptionModel.deleteOne({
                repositoryFullName: repoName.toLowerCase(),
                channelId,
            });

            // If no other active channels subscribe to this repository, remove webhook from GitHub
            const remainingSubs = await RepositorySubscriptionModel.countDocuments({
                repositoryFullName: repoName.toLowerCase(),
                active: true,
            });

            if (remainingSubs === 0) {
                const unwatchResult = await webhookService.removeWebhook(repoName);
                if (!unwatchResult.success) {
                    debug.warn(`Note: Could not remove remote webhook from GitHub: ${unwatchResult.error}`);
                }
            }

            debug.info(`Successfully unwatched repository ${repoName} in channel ${channelId}`);
            await interaction.editReply(`✅ Stopped watching \`${repoName}\` in <#${channelId}>`);
        } catch (error) {
            debug.error('Error in unwatch command:', error);
            const errorMessage = '❌ Failed to unwatch repository. Please try again later.';

            if (interaction.deferred) {
                await interaction.editReply(errorMessage);
            } else if (!interaction.replied) {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        }
    },
});
