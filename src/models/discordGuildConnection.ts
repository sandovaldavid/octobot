import mongoose, { Document, Schema } from 'mongoose';

export interface IDiscordGuildConnection extends Document {
    guildId: string;
    installationId: number;
    status: 'connected' | 'disconnected';
    connectedByDiscordUserId: string;
    createdAt: Date;
    updatedAt: Date;
}

const DiscordGuildConnectionSchema = new Schema<IDiscordGuildConnection>(
    {
        guildId: { type: String, required: true, index: true },
        installationId: { type: Number, required: true, index: true },
        status: {
            type: String,
            required: true,
            enum: ['connected', 'disconnected'],
            default: 'connected',
            index: true,
        },
        connectedByDiscordUserId: { type: String, required: true },
    },
    { timestamps: true }
);

DiscordGuildConnectionSchema.index({ guildId: 1, installationId: 1 }, { unique: true });

export const DiscordGuildConnectionModel = mongoose.model<IDiscordGuildConnection>(
    'DiscordGuildConnection',
    DiscordGuildConnectionSchema
);
