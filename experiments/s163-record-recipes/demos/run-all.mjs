#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const demos = ['openapi-used-ops.mjs', 'pricing-row-unit.mjs', 'csv-keyed-drift.mjs', 'rss-atom-brief.mjs'];
let failed = 0;
for (const d of demos) {
  const r = spawnSync(process.execPath, [path.join(here, d)], { encoding: 'utf8', cwd: path.join(here, '..') });
  process.stdout.write(`\n=== ${d} (exit ${r.status}) ===\n`);
  process.stdout.write(r.stdout || '');
  if (r.status !== 0) {
    process.stderr.write(r.stderr || '');
    failed += 1;
  }
}
process.exit(failed ? 1 : 0);
