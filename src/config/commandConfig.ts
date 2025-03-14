import { ButtonStyle } from 'discord.js';

export const CommandConfig = {
    pagination: {
        timeout: 300000,
        perPage: 10,
    },
    buttons: {
        prev: {
            label: 'Previous',
            style: ButtonStyle.Secondary,
        },
        next: {
            label: 'Next',
            style: ButtonStyle.Secondary,
        },
    },
};
