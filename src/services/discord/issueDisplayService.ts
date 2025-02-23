import { EmbedBuilder } from 'discord.js';
import { IssueDisplayOptions, IssueDisplayResult } from '@/interfaces/discord/issue';
import { GithubIssue } from '@/types/github';
import { DiscordColors } from '@/types/discord';
import { PaginationButtons } from '@utils/buttonBuilder';
import { RepositoryModel } from '@models/repository';
import { issueService } from '@services/github/issueService';
import { debug } from '@utils/logger';

export class IssueDisplayService {
    static async fetchAndDisplay(options: IssueDisplayOptions): Promise<IssueDisplayResult> {
        try {
            if (options.repo) {
                const repository = await RepositoryModel.findOne({ name: options.repo });
                if (!repository) {
                    return {
                        success: false,
                        embed: new EmbedBuilder()
                            .setTitle('Repository Not Found')
                            .setDescription(
                                `The repository \`${options.repo}\` was not found in the database. Please sync repositories first using \`/github repo sync\``
                            )
                            .setColor(DiscordColors.ERROR),
                    };
                }
            }

            const result = await issueService.getIssues(options);

            if (!result.success) {
                return {
                    success: false,
                    embed: new EmbedBuilder()
                        .setTitle('Error')
                        .setDescription(result.error || 'Failed to fetch issues')
                        .setColor(DiscordColors.ERROR),
                };
            }

            const issues = result.data;
            const total = result.total || 0;
            const totalPages = Math.ceil(total / options.perPage);

            if (!issues?.length) {
                return {
                    success: false,
                    embed: new EmbedBuilder()
                        .setTitle('No Issues Found')
                        .setDescription(`No ${options.state} issues found${options.repo ? ` in ${options.repo}` : ''}`)
                        .setColor(DiscordColors.INFO),
                };
            }

            return {
                success: true,
                embed: this.createEmbed(issues, options, total),
                buttons: PaginationButtons.create({
                    currentPage: options.page,
                    totalPages,
                }),
                totalPages,
                totalIssues: total,
            };
        } catch (error) {
            debug.error('Error in IssueDisplayService:', error);
            return {
                success: false,
                embed: new EmbedBuilder()
                    .setTitle('Error')
                    .setDescription('An error occurred while fetching issues')
                    .setColor(DiscordColors.ERROR),
            };
        }
    }

    static createEmbed(issues: GithubIssue[], options: IssueDisplayOptions, total: number): EmbedBuilder {
        return new EmbedBuilder()
            .setTitle(
                `${options.state.charAt(0).toUpperCase() + options.state.slice(1)} Issues${options.repo ? ` - ${options.repo}` : ''}`
            )
            .setDescription(`Found ${total} issues`)
            .setFields(
                issues.map((issue) => ({
                    name: `#${issue.number} - ${issue.title}`,
                    value: `State: ${issue.state}\nRepo: ${issue.repository?.name || options.repo || 'Unknown'}\n[View on GitHub](${issue.html_url})`,
                }))
            )
            .setColor(
                options.state === 'open'
                    ? DiscordColors.ISSUE_OPEN
                    : options.state === 'closed'
                      ? DiscordColors.ISSUE_CLOSED
                      : DiscordColors.DEFAULT
            )
            .setFooter({ text: `Page ${options.page}` });
    }
}
