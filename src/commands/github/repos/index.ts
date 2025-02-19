import { watch } from './watch';
import { unwatch } from './unwatch';
import { sync } from './sync';
import { checkWebhook } from './checkWebhook';

export { watch, unwatch, sync, checkWebhook };

export const handlers = {
    watch: watch.execute,
    unwatch: unwatch.execute,
    sync: sync.execute,
    'check-webhook': checkWebhook.execute,
};
