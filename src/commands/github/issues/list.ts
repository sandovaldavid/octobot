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
            await interaction.deferReply();
            const state = interaction.options.getString('state') || 'open';
            const repo = interaction.options.getString('repo');
            let currentPage = 1;
            const perPage = 10;

            // Function to fetch and display issues
            const displayIssues = async (page: number) => {
                const result = await issueService.getIssues({
                    state,
                    repo,
                    page,
                    per_page: perPage,
                    sort: 'updated',
                    direction: 'desc',
                });

                if (!result.success) {
                    await interaction.editReply({
                        embeds: [
                            {
                                title: 'Error',
                                description: result.error || 'Failed to fetch issues',
                                color: DiscordColors.ERROR,
                            },
                        ],
                    });
                    return null;
                }

                const issues = result.data;
                const total = result.total || 0;
                const totalPages = Math.ceil(total / perPage);

                if (!issues?.length) {
                    await interaction.editReply({
                        embeds: [
                            {
                                title: 'No Issues Found',
                                description: `No ${state} issues found${repo ? ` in ${repo}` : ''}`,
                                color: DiscordColors.INFO,
                            },
                        ],
                    });
                    return null;
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

                const embed = {
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
                };

                return { embed, buttons, totalPages };
            };

            // Initial display
            const initial = await displayIssues(currentPage);
            if (!initial) return;

            const message = await interaction.editReply({
                embeds: [initial.embed],
                components: [initial.buttons],
            });

            // Create button collector
            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 300000, // 5 minutes
            });

            collector.on('collect', async (i) => {
                if (i.user.id !== interaction.user.id) {
                    await i.reply({
                        content: 'You cannot use these buttons',
                        ephemeral: true,
                    });
                    return;
                }

                await i.deferUpdate();

                if (i.customId === 'prev') {
                    currentPage--;
                } else if (i.customId === 'next') {
                    currentPage++;
                }

                const result = await displayIssues(currentPage);
                if (result) {
                    await interaction.editReply({
                        embeds: [result.embed],
                        components: [result.buttons],
                    });
                }
            });

            collector.on('end', async () => {
                try {
                    await interaction.editReply({
                        components: [],
                    });
                } catch (error) {
                    debug.error('Error removing buttons:', error);
                }
            });
        } catch (error) {
            debug.error('Error in list issues command:', error);
            await interaction.editReply({
                embeds: [
                    {
                        title: 'Error',
                        description: 'Failed to fetch issues. Please try again later.',
                        color: DiscordColors.ERROR,
                    },
                ],
            });
        }
    },
};
