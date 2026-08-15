import { DiscordNotification } from '@/types/discord';
import { discordService } from '@services/discordService';
import { debug } from '@utils/logger';

export interface DeliveryStats {
    attempted: number;
    succeeded: number;
    failed: number;
}

export class DiscordDelivery {
    static async deliver(channelIds: string[], notification: DiscordNotification): Promise<DeliveryStats> {
        if (channelIds.length === 0) {
            return { attempted: 0, succeeded: 0, failed: 0 };
        }

        const deliveryPromises = channelIds.map(async (channelId) => {
            try {
                await discordService.sendNotification(channelId, notification);
                return { channelId, success: true };
            } catch (error) {
                debug.error(`Failed to deliver notification to channel ${channelId}:`, error);
                return { channelId, success: false, error };
            }
        });

        const results = await Promise.allSettled(deliveryPromises);

        let succeeded = 0;
        let failed = 0;

        for (const res of results) {
            if (res.status === 'fulfilled' && res.value.success) {
                succeeded++;
            } else {
                failed++;
            }
        }

        return {
            attempted: channelIds.length,
            succeeded,
            failed,
        };
    }
}
