import { REST, Routes } from 'discord.js';
import { logger } from '@utils/logger';

export interface CommandRegistrationOptions {
    rest: REST;
    clientId: string;
    guildId?: string;
    isGlobal: boolean;
    commands: any[];
}

export interface CommandRegistrationResult {
    isGlobal: boolean;
    route: string;
    commandCount: number;
}

export async function registerApplicationCommands(
    options: CommandRegistrationOptions
): Promise<CommandRegistrationResult> {
    const { rest, clientId, guildId, isGlobal, commands } = options;

    if (isGlobal) {
        const route = Routes.applicationCommands(clientId);
        logger.info(`Registering ${commands.length} global application commands (Client: ${clientId})...`);
        await rest.put(route, { body: commands });
        logger.info(`Successfully registered global application commands.`);
        return { isGlobal: true, route, commandCount: commands.length };
    }

    if (!guildId) {
        throw new Error('Cannot register guild commands: DISCORD_GUILD_ID is missing.');
    }

    const route = Routes.applicationGuildCommands(clientId, guildId);
    logger.info(`Registering ${commands.length} guild application commands for guild ${guildId}...`);
    await rest.put(route, { body: commands });
    logger.info(`Successfully registered guild commands for guild ${guildId}.`);
    return { isGlobal: false, route, commandCount: commands.length };
}
