// VM evidence recorder; records measured wall time, never guessed tokens/costs.
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
const [output, command, ...args] = process.argv.slice(2);
if (!output || !command) throw new Error('measure.mjs OUTPUT_PREFIX COMMAND [ARGS...]');
const tmp = fileURLToPath(new URL('../.local/tmp', import.meta.url)); mkdirSync(tmp, { recursive: true }); mkdirSync(dirname(output), { recursive: true });
const log = createWriteStream(`${output}.log`); const startedAt = new Date().toISOString(); const start = performance.now();
const child = spawn(command, args, { env: { ...process.env, TMPDIR: tmp }, stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
child.on('error', error => { log.write(`${error.message}\n`); });
child.on('close', (exitCode, signal) => {
  const record = { command: [command, ...args], cwd: process.cwd(), startedAt, endedAt: new Date().toISOString(), elapsedMs: Math.round(performance.now() - start), exitCode, signal, node: process.version, cpuMs: null, totalCost: null };
  log.end(); writeFileSync(`${output}.json`, `${JSON.stringify(record, null, 2)}\n`); console.log(JSON.stringify(record)); process.exitCode = exitCode ?? 1;
});
