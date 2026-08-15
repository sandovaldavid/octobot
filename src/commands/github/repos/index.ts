import { watch } from './watch';
import { unwatch } from './unwatch';
import { checkWebhook } from './checkWebhook';

export { watch, unwatch, checkWebhook };

export const handlers = {
    watch: watch.execute,
    unwatch: unwatch.execute,
    'check-webhook': checkWebhook.execute,
};
