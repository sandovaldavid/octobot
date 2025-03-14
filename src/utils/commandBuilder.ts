import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';

interface CommandOption {
    name: string;
    description: string;
    type: string;
    required?: boolean;
    choices?: { name: string; value: string }[];
}

interface SubcommandConfig {
    name: string;
    description: string;
    options?: CommandOption[];
}

interface SubcommandGroupConfig {
    name: string;
    description: string;
    subcommand: SubcommandConfig;
}

interface CommandConfig {
    name: string;
    description: string;
    subcommandGroup?: SubcommandGroupConfig;
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export function createCommand(config: CommandConfig) {
    const builder = new SlashCommandBuilder().setName(config.name).setDescription(config.description);

    if (config.subcommandGroup) {
        builder.addSubcommandGroup((group) =>
            group
                .setName(config.subcommandGroup!.name)
                .setDescription(config.subcommandGroup!.description)
                .addSubcommand((subcommand) => {
                    subcommand
                        .setName(config.subcommandGroup!.subcommand.name)
                        .setDescription(config.subcommandGroup!.subcommand.description);

                    config.subcommandGroup!.subcommand.options?.forEach((option) => {
                        if (option.type === 'string') {
                            subcommand.addStringOption((opt) => {
                                const baseOpt = opt
                                    .setName(option.name)
                                    .setDescription(option.description)
                                    .setRequired(!!option.required);

                                if (option.choices) {
                                    baseOpt.addChoices(...option.choices);
                                }

                                return baseOpt;
                            });
                        }
                        // Add more option types as needed
                    });

                    return subcommand;
                })
        );
    }

    return {
        data: builder,
        execute: config.execute,
    };
}
