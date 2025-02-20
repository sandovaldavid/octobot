import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    MessageFlags,
} from 'discord.js';
import { issueService } from '@services/github/issueService';
import { debug } from '@utils/logger';
import { DiscordColors } from '@types/discordTypes';
import { RepositoryModel } from '@models/repository';

export const list = {
    data: new SlashCommandBuilder()
        .setName('github')
        .setDescription('GitHub commands')
        .addSubcommandGroup((group) =>
            group
                .setName('issues')
                .setDescription('Issue management commands')
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('list')
                        .setDescription('List all issues')
                        .addStringOption((option) =>
                            option
                                .setName('state')
                                .setDescription('Filter issues by state')
                                .addChoices(
                                    { name: 'Open', value: 'open' },
                                    { name: 'Closed', value: 'closed' },
                                    { name: 'All', value: 'all' }
                                )
                                .setRequired(false)
                        )
                        .addStringOption((option) =>
                            option.setName('repo').setDescription('Filter by repository').setRequired(false)
                        )
                )
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        try {
            const fetchAndDisplayIssues = async (page: number) => {
                try {
                    if (repo) {
                        const repository = await RepositoryModel.findOne({ name: repo });
                        if (!repository) {
                            return {
                                success: false,
                                embed: {
                                    title: 'Repository Not Found',
                                    description: `The repository \`${repo}\` was not found in the database. Please sync repositories first using \`/github repo sync\``,
                                    color: DiscordColors.ERROR,
                                },
                            };
                        }
                    }

                    const result = await issueService.getIssues({
                        state: state as 'open' | 'closed' | 'all',
                        repo,
                        page,
                        per_page: perPage,
                        sort: 'updated',
                        direction: 'desc',
                    });

                    if (!result.success) {
                        return {
                            success: false,
                            embed: {
                                title: 'Error',
                                description: result.error || 'Failed to fetch issues',
                                color: DiscordColors.ERROR,
                            },
                        };
                    }

                    const issues = result.data;
                    const total = result.total || 0;
                    const totalPages = Math.ceil(total / perPage);

                    if (!issues?.length) {
                        return {
                            success: false,
                            embed: {
                                title: 'No Issues Found',
                                description: `No ${state} issues found${repo ? ` in ${repo}` : ''}`,
                                color: DiscordColors.INFO,
                            },
                        };
                    }

                    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
                        new ButtonBuilder()
                            .setCustomId('prev')
                            .setLabel('Previous')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(page <= 1),
                        new ButtonBuilder()
                            .setCustomId('next')
                            .setLabel('Next')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(page >= totalPages)
                    );

                    return {
                        success: true,
                        embed: {
                            title: `${state.charAt(0).toUpperCase() + state.slice(1)} Issues${repo ? ` - ${repo}` : ''}`,
                            description: `Found ${total} issues`,
                            fields: issues.map((issue) => ({
                                name: `#${issue.number} - ${issue.title}`,
                                value: `State: ${issue.state}\nRepo: ${issue.repository?.name || repo || 'Unknown'}\n[View on GitHub](${issue.html_url})`,
                            })),
                            color:
                                state === 'open'
                                    ? DiscordColors.ISSUE_OPEN
                                    : state === 'closed'
                                      ? DiscordColors.ISSUE_CLOSED
                                      : DiscordColors.DEFAULT,
                            footer: {
                                text: `Page ${page} of ${totalPages}`,
                            },
                        },
                        buttons,
                        totalPages,
                    };
                } catch (error) {
                    debug.error('Error in fetchAndDisplayIssues:', error);
                    return {
                        success: false,
                        embed: {
                            title: 'Error',
                            description: 'An error occurred while fetching issues',
                            color: DiscordColors.ERROR,
                        },
                    };
                }
            };

            // Initial defer
            await interaction.deferReply();

            // Initialize variables
            const state = interaction.options.getString('state') || 'open';
            const repo = interaction.options.getString('repo');
            let currentPage = 1;
            const perPage = 10;

            // Initial fetch and display
            const initial = await fetchAndDisplayIssues(currentPage);

            // Send initial response
            if (!initial.success) {
                return await interaction.editReply({
                    embeds: [initial.embed],
                    components: [],
                });
            }

            const message = await interaction.editReply({
                embeds: [initial.embed],
                components: [initial.buttons],
            });

            // Create button collector
            const collector = message.createMessageComponentCollector<ComponentType.Button>({
                time: 300000, // 5 minutes
                filter: (i) => i.user.id === interaction.user.id,
            });

            // Handle button interactions
            collector.on('collect', async (i) => {
                try {
                    await i.deferUpdate();

                    // Update page number
                    if (i.customId === 'prev' && currentPage > 1) {
                        currentPage--;
                    } else if (i.customId === 'next' && currentPage < initial.totalPages) {
                        currentPage++;
                    }

                    const result = await fetchAndDisplayIssues(currentPage);

                    if (!result.success) {
                        await i.editReply({
                            embeds: [result.embed],
                            components: [],
                        });
                        collector.stop();
                        return;
                    }

                    await i.editReply({
                        embeds: [result.embed],
                        components: [result.buttons],
                    });
                } catch (error) {
                    debug.error('Error handling button interaction:', error);
                    try {
                        await i.editReply({
                            embeds: [
                                {
                                    title: '❌ Error',
                                    description: 'Failed to update issues . Please try again.',
                                    color: DiscordColors.ERROR,
                                },
                            ],
                            components: [],
                        });
                        collector.stop();
                    } catch (replyError) {
                        debug.error('Failed to send error message:', replyError);
                    }
                }
            });

            // Clean up when collector ends
            collector.on('end', () => {
                if (message.editable) {
                    message
                        .edit({ components: [] })
                        .catch(() => debug.error('Failed to remove buttons after collector end'));
                }
            });
        } catch (error) {
            debug.error('Error in list issues command:', error);

            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    embeds: [
                        {
                            title: 'Error',
                            description: 'Failed to fetch issues. Please try again later.',
                            color: DiscordColors.ERROR,
                        },
                    ],
                    flags: MessageFlags.Ephemeral,
                });
            } else if (interaction.deferred) {
                await interaction.editReply({
                    embeds: [
                        {
                            title: 'Error',
                            description: 'Failed to fetch issues. Please try again later.',
                            color: DiscordColors.ERROR,
                        },
                    ],
                    components: [],
                });
            }
        }
    },
};
