#!/usr/bin/env node
// Existing entry, with extraction and rules supplied by the pinned shared kit.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const run = spawnSync(process.execPath, ['scripts/release/kit.mjs', 'copy', ...process.argv.slice(2)], {cwd: root, stdio: 'inherit'});
process.exit(run.status ?? 1);
