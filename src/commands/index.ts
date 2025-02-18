import { Collection, CommandInteraction, ChatInputCommandInteraction } from 'discord.js';
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
        this.commands.set(watch.data.name, watch);
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
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: 'Command not found',
                        ephemeral: true,
                    });
                }
                return;
            }

            debug.info(`Executing command: ${interaction.commandName}`);
            await command.execute(interaction);
        } catch (error) {
            debug.error(`Error executing command ${interaction.commandName}:`, error);

            try {
                const errorMessage = {
                    content: 'There was an error executing this command!',
                    ephemeral: true,
                };

                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply(errorMessage);
                } else if (interaction.deferred) {
                    await interaction.editReply(errorMessage);
                } else if (interaction.replied) {
                    await interaction.followUp(errorMessage);
                }
            } catch (replyError) {
                debug.error('Error sending error response:', replyError);
            }
        }
    }
}

export const commandRegistry = CommandRegistry.getInstance();
