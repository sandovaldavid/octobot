import { EmbedBuilder } from 'discord.js';
import { IssueDisplayOptions, IssueDisplayResult } from '@interfaces/discord/interfaces';
import { GithubIssue } from '@/types/github';
import { DiscordColors } from '@/types/discord';
import { PaginationButtons } from '@utils/buttonBuilder';
import { issueService } from '@services/github/issueService';
import { debug } from '@utils/logger';

export class IssueDisplayService {
    static async fetchAndDisplay(options: IssueDisplayOptions): Promise<IssueDisplayResult> {
        try {
            const result = await issueService.getIssues({
                repo: options.repo,
                state: options.state,
                page: options.page,
                per_page: options.perPage,
                sort: options.sort,
                direction: options.direction,
            });

            if (!result.success || !result.data) {
                return {
                    success: false,
                    embed: new EmbedBuilder()
                        .setTitle('Error')
                        .setDescription(result.error || 'Failed to fetch issues from GitHub')
                        .setColor(DiscordColors.ERROR),
                };
            }

            const { issues, page, hasNext, hasPrevious } = result.data;

            if (!issues.length) {
                return {
                    success: false,
                    embed: new EmbedBuilder()
                        .setTitle('No Issues Found')
                        .setDescription(`No ${options.state} issues found in \`${options.repo}\``)
                        .setColor(DiscordColors.INFO),
                };
            }

            return {
                success: true,
                embed: this.createEmbed(issues, options, page),
                buttons: PaginationButtons.create({
                    currentPage: page,
                    hasNext,
                    hasPrevious,
                }),
                page,
                hasNext,
                hasPrevious,
            };
        } catch (error) {
            debug.error('Error in IssueDisplayService:', error);
            return {
                success: false,
                embed: new EmbedBuilder()
                    .setTitle('Error')
                    .setDescription('An error occurred while fetching issues from GitHub')
                    .setColor(DiscordColors.ERROR),
            };
        }
    }

    static createEmbed(issues: GithubIssue[], options: IssueDisplayOptions, page: number): EmbedBuilder {
        const stateTitle = options.state.charAt(0).toUpperCase() + options.state.slice(1);

        return new EmbedBuilder()
            .setTitle(`${stateTitle} Issues - ${options.repo}`)
            .setFields(
                issues.map((issue) => ({
                    name: `#${issue.number} - ${issue.title}`,
                    value: `State: \`${issue.state}\` • [View on GitHub](${issue.html_url})`,
                }))
            )
            .setColor(
                options.state === 'open'
                    ? DiscordColors.ISSUE_OPEN
                    : options.state === 'closed'
                      ? DiscordColors.ISSUE_CLOSED
                      : DiscordColors.DEFAULT
            )
            .setFooter({ text: `Page ${page}` });
    }
}
