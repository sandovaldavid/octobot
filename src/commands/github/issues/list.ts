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
            description: 'List all issues',
            options: [
                {
                    name: 'state',
                    description: 'Filter issues by state',
                    type: 'string',
                    choices: [
                        { name: 'Open', value: 'open' },
                        { name: 'Closed', value: 'closed' },
                        { name: 'All', value: 'all' },
                    ],
                    required: false,
                },
                {
                    name: 'repo',
                    description: 'Filter by repository',
                    type: 'string',
                    required: false,
                },
            ],
        },
    },

    async execute(interaction: ChatInputCommandInteraction) {
        try {
            await interaction.deferReply();

            const state = (interaction.options.getString('state') || 'open') as 'open' | 'closed' | 'all';
            const repo = interaction.options.getString('repo');
            let currentPage = 1;

            const displayResult = await IssueDisplayService.fetchAndDisplay({
                state,
                repo,
                page: currentPage,
                perPage: CommandConfig.pagination.perPage,
            });

            if (!displayResult.success) {
                return await interaction.editReply({
                    embeds: [displayResult.embed],
                    components: [],
                });
            }

            const message = await interaction.editReply({
                embeds: [displayResult.embed],
                components: displayResult.buttons ? [displayResult.buttons] : [],
            });

            const collector = message.createMessageComponentCollector<ComponentType.Button>({
                time: CommandConfig.pagination.timeout,
                filter: (i) => i.user.id === interaction.user.id,
            });

            collector.on('collect', async (i) => {
                try {
                    await i.deferUpdate();

                    if (i.customId === 'prev' && currentPage > 1) {
                        currentPage--;
                    } else if (i.customId === 'next' && currentPage < (displayResult.totalPages || 1)) {
                        currentPage++;
                    }

                    const newResult = await IssueDisplayService.fetchAndDisplay({
                        state,
                        repo,
                        page: currentPage,
                        perPage: CommandConfig.pagination.perPage,
                    });

                    await i.editReply({
                        embeds: [newResult.embed],
                        components: newResult.buttons ? [newResult.buttons] : [],
                    });

                    if (!newResult.success) {
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
