import { describe, expect, it } from 'bun:test';
import { EmbedBuilder, PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { ADMIN_SUBCOMMANDS, verifyCommandAuthorization } from '@/services/discord/commandAuthorizationPolicy';
import { DEPRECATION_NOTICE, decorateResponse } from '@/services/discord/commandResponseDecorator';

describe('Discord - Command Authorization and Deprecation', () => {
    describe('verifyCommandAuthorization', () => {
        it('should define expected admin subcommands set', () => {
            expect(ADMIN_SUBCOMMANDS.has('connect')).toBe(true);
            expect(ADMIN_SUBCOMMANDS.has('disconnect')).toBe(true);
            expect(ADMIN_SUBCOMMANDS.has('repo.watch')).toBe(true);
            expect(ADMIN_SUBCOMMANDS.has('repo.unwatch')).toBe(true);
            expect(ADMIN_SUBCOMMANDS.has('status')).toBe(false);
            expect(ADMIN_SUBCOMMANDS.has('repo.check')).toBe(false);
            expect(ADMIN_SUBCOMMANDS.has('issues.list')).toBe(false);
        });

        it('should require ManageGuild or Administrator for mutation commands when user has no permissions', () => {
            const mockInteraction = {
                commandName: 'gh',
                options: {
                    getSubcommandGroup: () => 'repo',
                    getSubcommand: () => 'watch',
                },
                memberPermissions: new PermissionsBitField(0n),
            } as any;

            expect(verifyCommandAuthorization(mockInteraction)).toBe(false);
        });

        it('should deny admin command if memberPermissions is null and member.permissions is missing', () => {
            const mockInteraction = {
                commandName: 'gh',
                options: {
                    getSubcommandGroup: () => null,
                    getSubcommand: () => 'connect',
                },
                memberPermissions: null,
                member: null,
            } as any;

            expect(verifyCommandAuthorization(mockInteraction)).toBe(false);
        });

        it('should allow admin command when user has ManageGuild permission via memberPermissions', () => {
            const mockInteraction = {
                commandName: 'gh',
                options: {
                    getSubcommandGroup: () => null,
                    getSubcommand: () => 'connect',
                },
                memberPermissions: new PermissionsBitField(PermissionFlagsBits.ManageGuild),
            } as any;

            expect(verifyCommandAuthorization(mockInteraction)).toBe(true);
        });

        it('should allow admin command when user has Administrator permission via memberPermissions', () => {
            const mockInteraction = {
                commandName: 'gh',
                options: {
                    getSubcommandGroup: () => 'repo',
                    getSubcommand: () => 'unwatch',
                },
                memberPermissions: new PermissionsBitField(PermissionFlagsBits.Administrator),
            } as any;

            expect(verifyCommandAuthorization(mockInteraction)).toBe(true);
        });

        it('should support checking permissions on interaction.member.permissions fallback', () => {
            const mockInteraction = {
                commandName: 'gh',
                options: {
                    getSubcommandGroup: () => null,
                    getSubcommand: () => 'disconnect',
                },
                memberPermissions: null,
                member: {
                    permissions: new PermissionsBitField(PermissionFlagsBits.ManageGuild),
                },
            } as any;

            expect(verifyCommandAuthorization(mockInteraction)).toBe(true);
        });

        it('should allow regular members for read-only status and issue commands without any permissions', () => {
            const mockInteractionStatus = {
                commandName: 'gh',
                options: {
                    getSubcommandGroup: () => null,
                    getSubcommand: () => 'status',
                },
                memberPermissions: new PermissionsBitField(0n),
            } as any;

            expect(verifyCommandAuthorization(mockInteractionStatus)).toBe(true);

            const mockInteractionCheck = {
                commandName: 'gh',
                options: {
                    getSubcommandGroup: () => 'repo',
                    getSubcommand: () => 'check',
                },
                memberPermissions: null,
            } as any;

            expect(verifyCommandAuthorization(mockInteractionCheck)).toBe(true);

            const mockInteractionIssues = {
                commandName: 'gh',
                options: {
                    getSubcommandGroup: () => 'issues',
                    getSubcommand: () => 'list',
                },
                memberPermissions: null,
            } as any;

            expect(verifyCommandAuthorization(mockInteractionIssues)).toBe(true);
        });
    });

    describe('decorateResponse', () => {
        it('should return untouched payload when isDeprecatedNamespace is false', () => {
            const payload = { content: 'Success message', ephemeral: true };
            const result = decorateResponse(payload, false);
            expect(result).toBe(payload);
            expect(result.content).toBe('Success message');
        });

        it('should append deprecation notice to content string when isDeprecatedNamespace is true and no embeds', () => {
            const payload = { content: '✅ Subscribed to repository.', ephemeral: true };
            const result = decorateResponse(payload, true);
            expect(result.content).toBe(`✅ Subscribed to repository.\n\n${DEPRECATION_NOTICE}`);
            expect(result.ephemeral).toBe(true);
        });

        it('should set deprecation notice as content if payload has no content and no embeds', () => {
            const payload = { ephemeral: true };
            const result = decorateResponse(payload, true);
            expect(result.content).toBe(DEPRECATION_NOTICE);
        });

        it('should append deprecation notice to existing embed footer text', () => {
            const embed = new EmbedBuilder()
                .setTitle('GitHub Status')
                .setDescription('Connected to OctoOrg')
                .setFooter({ text: 'Page 1 of 1' });

            const payload = { embeds: [embed] };
            const result = decorateResponse(payload, true);

            expect(result.embeds).toBeDefined();
            expect(result.embeds!.length).toBe(1);
            const rawEmbed = result.embeds![0] as any;
            expect(rawEmbed.footer?.text).toBe(`Page 1 of 1 • ${DEPRECATION_NOTICE}`);
        });

        it('should create footer with deprecation notice if embed has no prior footer', () => {
            const embed = new EmbedBuilder().setTitle('Issues').setDescription('Found 5 issues');

            const payload = { embeds: [embed] };
            const result = decorateResponse(payload, true);

            const rawEmbed = result.embeds![0] as any;
            expect(rawEmbed.footer?.text).toBe(DEPRECATION_NOTICE);
        });

        it('should handle plain object APIEmbeds in embeds array', () => {
            const plainEmbed = {
                title: 'Health Check',
                description: 'All services green',
                footer: { text: 'Checked just now', icon_url: 'https://example.com/icon.png' },
            };

            const payload = { embeds: [plainEmbed] };
            const result = decorateResponse(payload, true);

            const rawEmbed = result.embeds![0] as any;
            expect(rawEmbed.footer?.text).toBe(`Checked just now • ${DEPRECATION_NOTICE}`);
            expect(rawEmbed.footer?.icon_url).toBe('https://example.com/icon.png');
        });
    });
});
