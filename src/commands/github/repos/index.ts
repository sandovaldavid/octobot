import { watch } from './watch';
import { unwatch } from './unwatch';
import { sync } from './sync';

export { watch, unwatch, sync };

export const handlers = {
    watch: watch.execute,
    unwatch: unwatch.execute,
    sync: sync.execute,
};
