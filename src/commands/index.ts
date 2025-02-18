import { Collection } from 'discord.js';
import { watch } from '@commands/watch/watch';
import { DiscordCommand } from '@types/discordTypes';
import { debug } from '@utils/logger';

class CommandRegistry {
    private static instance: CommandRegistry;
    private commands: Collection<string, DiscordCommand>;

    private constructor() {
        this.commands = new Collection();
        this.registerCommands();
    }

    public static getInstance(): CommandRegistry {
        if (!CommandRegistry.instance) {
            CommandRegistry.instance = new CommandRegistry();
        }
        return CommandRegistry.instance;
    }

    private registerCommands() {
        // Register all commands here
        this.commands.set('github', watch);
        debug.info('Commands registered:', Array.from(this.commands.keys()));
    }

    public getCommands(): Collection<string, DiscordCommand> {
        return this.commands;
    }

    public getCommand(name: string): DiscordCommand | undefined {
        return this.commands.get(name);
    }

    public async handleCommand(interaction: any) {
        if (!interaction.isCommand()) return;

        const command = this.commands.get(interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction);
        } catch (error) {
            debug.error(`Error executing command ${interaction.commandName}:`, error);
            const response = {
                content: 'There was an error executing this command!',
                ephemeral: true,
            };

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(response);
            } else {
                await interaction.reply(response);
            }
        }
    }
}

export const commandRegistry = CommandRegistry.getInstance();
