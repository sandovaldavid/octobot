import { ActionRowBuilder, ButtonBuilder } from 'discord.js';
import { PaginationOptions } from '@/interfaces/discord/interfaces';
import { CommandConfig } from '@config/commandConfig';

export class PaginationButtons {
    static create({
        currentPage = 1,
        totalPages,
        hasPrevious,
        hasNext,
        isDisabled = false,
    }: PaginationOptions): ActionRowBuilder<ButtonBuilder> {
        const { prev, next } = CommandConfig.buttons;

        const isPrevDisabled = isDisabled || (hasPrevious !== undefined ? !hasPrevious : currentPage <= 1);
        const isNextDisabled =
            isDisabled ||
            (hasNext !== undefined ? !hasNext : totalPages !== undefined ? currentPage >= totalPages : false);

        return new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId('prev')
                .setLabel(prev.label)
                .setStyle(prev.style)
                .setDisabled(isPrevDisabled),
            new ButtonBuilder()
                .setCustomId('next')
                .setLabel(next.label)
                .setStyle(next.style)
                .setDisabled(isNextDisabled)
        );
    }
}
