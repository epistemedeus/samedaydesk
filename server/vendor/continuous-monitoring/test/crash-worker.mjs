// A test-owned process ends only itself at the selected durable boundary.
import { readFileSync } from 'node:fs';
import { MonitorStore } from '../src/store.mjs';
import { tick } from '../src/worker.mjs';
const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const store = new MonitorStore(config.database, config.options);
const stage = process.argv[3];
await tick(store, stage === 'staged' ? { afterStage: () => process.exit(17) } : { afterStart: () => process.exit(18) });
store.close();
