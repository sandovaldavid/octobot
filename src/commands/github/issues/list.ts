import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
} from 'discord.js';
import { issueService } from '@services/github/issueService';
import { debug } from '@utils/logger';
import { DiscordColors } from '@types/discordTypes';

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
            // Initial defer
            await interaction.deferReply();

            // Initialize variables
            const state = interaction.options.getString('state') || 'open';
            const repo = interaction.options.getString('repo');
            let currentPage = 1;
            const perPage = 10;

            // Function to fetch and display issues
            const fetchAndDisplayIssues = async (page: number) => {
                const result = await issueService.getIssues({
                    state,
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
            };

            // Initial display
            const initial = await fetchAndDisplayIssues(currentPage);
            const message = await interaction.editReply({
                embeds: [initial.embed],
                components: initial.success ? [initial.buttons] : [],
            });

            if (!initial.success) {
                return;
            }

            // Create button collector
            const collector = message.createMessageComponentCollector<ComponentType.Button>({
                time: 300000,
                filter: (i) => i.user.id === interaction.user.id,
            });

            collector.on('collect', async (i) => {
                try {
                    // Update page number
                    if (i.customId === 'prev' && currentPage > 1) {
                        currentPage--;
                    } else if (i.customId === 'next') {
                        currentPage++;
                    }

                    // Acknowledge button interaction
                    await i.deferUpdate();

                    // Get and display new page
                    const result = await fetchAndDisplayIssues(currentPage);
                    await i.editReply({
                        embeds: [result.embed],
                        components: result.success ? [result.buttons] : [],
                    });
                } catch (error) {
                    debug.error('Error handling button interaction:', error);
                }
            });

            collector.on('end', () => {
                interaction.editReply({ components: [] }).catch(() => {});
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
                    flags: 64,
                });
            }
        }
    },
};
