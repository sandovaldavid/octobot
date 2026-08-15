import { InteractionReplyOptions } from 'discord.js';

export const DEPRECATION_NOTICE =
    '💡 `/github` is deprecated and will be removed in a future major release. Use `/gh` instead.';

export function decorateResponse(
    payload: InteractionReplyOptions,
    isDeprecatedNamespace: boolean
): InteractionReplyOptions {
    if (!isDeprecatedNamespace) {
        return payload;
    }

    if (payload.embeds && payload.embeds.length > 0) {
        const modifiedEmbeds = payload.embeds.map((embed) => {
            const plain =
                typeof (embed as any).toJSON === 'function'
                    ? (embed as any).toJSON()
                    : { ...(embed as Record<string, any>) };
            const existingFooterText = plain.footer?.text;
            return {
                ...plain,
                footer: {
                    ...plain.footer,
                    text: existingFooterText ? `${existingFooterText} • ${DEPRECATION_NOTICE}` : DEPRECATION_NOTICE,
                },
            };
        });
        return { ...payload, embeds: modifiedEmbeds };
    }

    if (payload.content) {
        return { ...payload, content: `${payload.content}\n\n${DEPRECATION_NOTICE}` };
    }

    return { ...payload, content: DEPRECATION_NOTICE };
}
