import { ChatInputCommandInteraction } from 'discord.js';
import { repositoryService } from '@services/github/repositoryService';
import { debug } from '@utils/logger';
import { createCommand } from '@utils/commandBuilder';

export const sync = createCommand({
    name: 'github',
    description: 'GitHub commands',
    subcommandGroup: {
        name: 'repo',
        description: 'Repository management commands',
        subcommand: {
            name: 'sync',
            description: 'Synchronize GitHub repositories with database',
        },
    },
    async execute(interaction: ChatInputCommandInteraction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand !== 'sync') return;

        try {
            await interaction.deferReply();

            debug.info('Starting repository synchronization');
            await interaction.editReply('🔄 Syncing repositories with GitHub...');

            const result = await repositoryService.syncRepositories();

            if (!result.success) {
                debug.error('Sync failed:', result.error);
                await interaction.editReply('❌ Failed to sync repositories: ' + result.error);
                return;
            }

            const totalRepos = result.total || 0;
            debug.info(`Successfully synchronized ${totalRepos} repositories`);

            await interaction.editReply(
                `✅ Successfully synchronized ${totalRepos} repositories!\n` +
                    `Repository list has been updated with the latest data from GitHub.`
            );
        } catch (error) {
            debug.error('Error in sync command:', error);
            await interaction.editReply('❌ Failed to sync repositories. Please try again later.');
        }
    },
});
