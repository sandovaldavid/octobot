import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { PaginationOptions } from '@/interfaces/discord/issue';
import { CommandConfig } from '@config/commandConfig';

export class PaginationButtons {
    static create({ currentPage, totalPages, isDisabled = false }: PaginationOptions): ActionRowBuilder<ButtonBuilder> {
        const { prev, next } = CommandConfig.buttons;

        return new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId('prev')
                .setLabel(prev.label)
                .setStyle(prev.style)
                .setDisabled(isDisabled || currentPage <= 1),
            new ButtonBuilder()
                .setCustomId('next')
                .setLabel(next.label)
                .setStyle(next.style)
                .setDisabled(isDisabled || currentPage >= totalPages)
        );
    }
}
