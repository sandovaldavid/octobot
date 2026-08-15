import { ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';

export const ADMIN_SUBCOMMANDS = new Set<string>(['connect', 'disconnect', 'repo.watch', 'repo.unwatch']);

export function verifyCommandAuthorization(interaction: ChatInputCommandInteraction): boolean {
    const group = interaction.options?.getSubcommandGroup?.(false);
    const sub = interaction.options?.getSubcommand?.(false);
    const fullCommandPath = group && sub ? `${group}.${sub}` : sub || '';

    if (!ADMIN_SUBCOMMANDS.has(fullCommandPath)) {
        return true;
    }

    const permissions =
        interaction.memberPermissions ??
        (interaction.member && 'permissions' in interaction.member ? (interaction.member as any).permissions : null);

    if (!permissions || typeof permissions.has !== 'function') {
        return false;
    }

    return permissions.has(PermissionFlagsBits.ManageGuild) || permissions.has(PermissionFlagsBits.Administrator);
}
