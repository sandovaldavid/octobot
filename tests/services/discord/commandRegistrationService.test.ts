import { describe, expect, it, mock } from 'bun:test';
import { Routes } from 'discord.js';
import { registerApplicationCommands } from '../../../src/services/discord/commandRegistrationService';

describe('Discord - Command Registration Service', () => {
    const mockCommands = [
        { name: 'gh', description: 'GitHub App commands' },
        { name: 'github', description: 'Deprecated alias' },
    ];

    it('should register global application commands when isGlobal is true', async () => {
        const putMock = mock(() => Promise.resolve({ success: true }));
        const mockRest = {
            put: putMock,
        } as any;

        const result = await registerApplicationCommands({
            rest: mockRest,
            clientId: 'client-123',
            isGlobal: true,
            commands: mockCommands,
        });

        expect(result.isGlobal).toBe(true);
        expect(result.route).toBe(Routes.applicationCommands('client-123'));
        expect(result.commandCount).toBe(2);
        expect(putMock).toHaveBeenCalledWith(Routes.applicationCommands('client-123'), {
            body: mockCommands,
        });
    });

    it('should register guild application commands when isGlobal is false and guildId is provided', async () => {
        const putMock = mock(() => Promise.resolve({ success: true }));
        const mockRest = {
            put: putMock,
        } as any;

        const result = await registerApplicationCommands({
            rest: mockRest,
            clientId: 'client-123',
            guildId: 'guild-456',
            isGlobal: false,
            commands: mockCommands,
        });

        expect(result.isGlobal).toBe(false);
        expect(result.route).toBe(Routes.applicationGuildCommands('client-123', 'guild-456'));
        expect(result.commandCount).toBe(2);
        expect(putMock).toHaveBeenCalledWith(Routes.applicationGuildCommands('client-123', 'guild-456'), {
            body: mockCommands,
        });
    });

    it('should throw an error when isGlobal is false but guildId is missing', async () => {
        const putMock = mock(() => Promise.resolve({ success: true }));
        const mockRest = {
            put: putMock,
        } as any;

        expect(
            registerApplicationCommands({
                rest: mockRest,
                clientId: 'client-123',
                isGlobal: false,
                commands: mockCommands,
            })
        ).rejects.toThrow('Cannot register guild commands: DISCORD_GUILD_ID is missing.');
    });
});
