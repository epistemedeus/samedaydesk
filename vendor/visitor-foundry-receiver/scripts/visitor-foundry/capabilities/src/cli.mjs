#!/usr/bin/env node
import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { SCHEMAS, LIMITS, createSnapshot, readSnapshot, resolvePage, listVersions, dependencyImpact } from './index.mjs';
import { check, safeData } from './contracts.mjs';
import { demo, packageFixture, request } from '../examples/fixtures.mjs';
import { runHoldouts } from '../examples/holdouts.mjs';

async function readJSON(path) {
  check(typeof path === 'string' && path.length > 0, 'JSON file path required');
  const handle = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat(); check(stat.isFile() && stat.size <= LIMITS.bytes, 'input must be a regular JSON file under 16 MiB');
    // Bound reads even if a concurrently written file grows after stat.
    const bytes = Buffer.alloc(LIMITS.bytes + 1); let total = 0;
    while (total < bytes.length) {
      const { bytesRead } = await handle.read(bytes, total, bytes.length - total, total);
      if (!bytesRead) break; total += bytesRead;
    }
    check(total <= LIMITS.bytes, 'input exceeds 16 MiB');
    let data; try { data = JSON.parse(bytes.subarray(0, total).toString('utf8')); } catch { check(false, 'malformed JSON'); }
    return safeData(data);
  } finally { await handle.close(); }
}
function flags(args, allowed) {
  check(args.length % 2 === 0, 'flags require values'); const result = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]; check(allowed.includes(key) && !Object.hasOwn(result, key), `unknown or duplicate flag ${key}`);
    result[key] = args[i + 1];
  }
  return result;
}
export async function main(argv) {
  const [command, ...args] = argv;
  if (['demo', 'holdouts', 'schemas', 'help'].includes(command)) {
    check(args.length === 0, `${command} takes no arguments`);
    if (command === 'demo') return demo();
    if (command === 'holdouts') return runHoldouts();
    if (command === 'schemas') return SCHEMAS;
    return { commands: ['demo', 'holdouts', 'schemas', 'fixture snapshot|request|policy', 'build --input JSON',
      'resolve --snapshot JSON --request JSON --now UTC [--policy JSON] [--limit N] [--cursor TOKEN]',
      'list --snapshot JSON [--outcome TEXT] [--capability-id ID] [--limit N] [--cursor TOKEN]', 'impact --snapshot JSON --target JSON'],
      note: 'Local JSON only; no network, shell proposals, package scripts or contributed code. Explicit UTC clock required.' };
  }
  if (command === 'fixture') {
    check(args.length === 1 && ['snapshot', 'request', 'policy'].includes(args[0]), 'fixture requires snapshot|request|policy');
    const fixture = packageFixture();
    return args[0] === 'request' ? request({ outcome: 'node-engine-compatibility', input: { range: '>=22.2', nodeVersion: '22.3.0' }, capabilityId: fixture.capability.capabilityId }) : fixture[args[0]];
  }
  if (command === 'build') { const f = flags(args, ['--input']); return createSnapshot(await readJSON(f['--input'])); }
  check(['resolve', 'list', 'impact'].includes(command), 'unknown command; run help');
  const allowed = command === 'resolve' ? ['--snapshot', '--request', '--now', '--policy', '--limit', '--cursor']
    : command === 'list' ? ['--snapshot', '--outcome', '--capability-id', '--limit', '--cursor'] : ['--snapshot', '--target'];
  const f = flags(args, allowed), snapshot = readSnapshot(await readJSON(f['--snapshot']));
  const paging = { ...(f['--limit'] !== undefined ? { limit: Number(f['--limit']) } : {}), ...(f['--cursor'] ? { cursor: f['--cursor'] } : {}) };
  if (command === 'list') return listVersions(snapshot, { ...paging, outcome: f['--outcome'] ?? null, capabilityId: f['--capability-id'] ?? null });
  if (command === 'impact') return dependencyImpact(snapshot, await readJSON(f['--target']));
  const req = await readJSON(f['--request']), policy = f['--policy'] ? await readJSON(f['--policy']) : undefined;
  return resolvePage(snapshot, req, { ...paging, now: f['--now'], policy });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(JSON.stringify(await main(process.argv.slice(2)), null, 2) + '\n'); }
  catch (error) { process.stderr.write(JSON.stringify({ schema: 'neomorphic.foundry.capability-error.v1', code: error.code || 'INVALID_INPUT', message: error.message }) + '\n'); process.exitCode = 2; }
}
