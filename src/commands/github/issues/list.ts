import { ChatInputCommandInteraction, ComponentType, MessageFlags } from 'discord.js';
import { IssueDisplayService } from '@services/discord/issueDisplayService';
import { CommandConfig } from '@config/commandConfig';
import { debug } from '@utils/logger';
import { createCommand } from '@utils/commandBuilder';
import { DiscordColors } from '@/types/discord';

export const list = createCommand({
    name: 'github',
    description: 'GitHub commands',
    subcommandGroup: {
        name: 'issues',
        description: 'Issue management commands',
        subcommand: {
            name: 'list',
            description: 'List issues from a GitHub repository',
            options: [
                {
                    name: 'repo',
                    description: 'Name of the repository to list issues from',
                    type: 'string',
                    required: true,
                },
                {
                    name: 'state',
                    description: 'Filter issues by state (default: open)',
                    type: 'string',
                    choices: [
                        { name: 'Open', value: 'open' },
                        { name: 'Closed', value: 'closed' },
                        { name: 'All', value: 'all' },
                    ],
                    required: false,
                },
            ],
        },
    },

    async execute(interaction: ChatInputCommandInteraction) {
        try {
            await interaction.deferReply();

            const repo = interaction.options.getString('repo', true);
            const state = (interaction.options.getString('state') || 'open') as 'open' | 'closed' | 'all';
            let currentPage = 1;

            let currentResult = await IssueDisplayService.fetchAndDisplay({
                state,
                repo,
                page: currentPage,
                perPage: CommandConfig.pagination.perPage,
            });

            if (!currentResult.success) {
                await interaction.editReply({
                    embeds: [currentResult.embed],
                    components: [],
                });
                return;
            }

            const message = await interaction.editReply({
                embeds: [currentResult.embed],
                components: currentResult.buttons ? [currentResult.buttons] : [],
            });

            const collector = message.createMessageComponentCollector<ComponentType.Button>({
                time: CommandConfig.pagination.timeout,
                filter: (i) => i.user.id === interaction.user.id,
            });

            collector.on('collect', async (i) => {
                try {
                    await i.deferUpdate();

                    if (i.customId === 'prev' && (currentResult.hasPrevious || currentPage > 1)) {
                        currentPage--;
                    } else if (i.customId === 'next' && currentResult.hasNext) {
                        currentPage++;
                    }

                    currentResult = await IssueDisplayService.fetchAndDisplay({
                        state,
                        repo,
                        page: currentPage,
                        perPage: CommandConfig.pagination.perPage,
                    });

                    await i.editReply({
                        embeds: [currentResult.embed],
                        components: currentResult.buttons ? [currentResult.buttons] : [],
                    });

                    if (!currentResult.success) {
                        collector.stop();
                    }
                } catch (error) {
                    debug.error('Error handling button interaction:', error);
                }
            });

            collector.on('end', () => {
                if (message.editable) {
                    message.edit({ components: [] }).catch(() => {
                        debug.error('Failed to remove buttons after collector end');
                    });
                }
            });
        } catch (error) {
            debug.error('Error in list command:', error);

            const errorEmbed = {
                title: 'Error',
                description: 'Failed to fetch issues. Please try again later.',
                color: DiscordColors.ERROR,
            };

            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    embeds: [errorEmbed],
                    flags: MessageFlags.Ephemeral,
                });
            } else if (interaction.deferred) {
                await interaction.editReply({
                    embeds: [errorEmbed],
                    components: [],
                });
            }
        }
    },
});
