import { Collection, ChatInputCommandInteraction } from 'discord.js';
import { debug } from '@utils/logger';
import { github } from './github';

export interface DiscordCommand {
    data: any;
    execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

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
        this.commands.set(github.data.name, github);
        debug.info('Commands registered:', Array.from(this.commands.keys()));
    }

    public getCommands(): Collection<string, DiscordCommand> {
        return this.commands;
    }

    public async handleCommand(interaction: ChatInputCommandInteraction) {
        if (!interaction.isChatInputCommand()) return;

        try {
            const command = this.commands.get(interaction.commandName);
            if (!command) {
                debug.warn(`Command not found: ${interaction.commandName}`);
                return;
            }

            await command.execute(interaction);
        } catch (error) {
            debug.error('Error executing command:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'There was an error executing this command!',
                    ephemeral: true,
                });
            }
        }
    }
}

export const commandRegistry = CommandRegistry.getInstance();

export { github };
