import { ChatInputCommandInteraction } from 'discord.js';
import { RepositoryModel } from '@models/repository';
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
            description: 'Stop watching a GitHub repository',
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
            await interaction.deferReply();
            const repoName = interaction.options.getString('name', true);

            debug.info(`Attempting to unwatch repository: ${repoName}`);

            const repository = await RepositoryModel.findOne({ name: repoName });
            if (!repository) {
                await interaction.editReply(`❌ Repository \`${repoName}\` is not being watched`);
                return;
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
        } catch (error) {
            debug.error('Error in unwatch command:', error);
            const errorMessage = '❌ Failed to unwatch repository. Please try again later.';

            if (interaction.deferred) {
                await interaction.editReply(errorMessage);
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        }
    },
});
