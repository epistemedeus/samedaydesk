#!/usr/bin/env node
// Run this entry under the shared build flock. Every destination is exclusively
// created; no checkout, live configuration, enrollment or history is replaced.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const args = process.argv.slice(2);
const arg = key => args[args.indexOf(key) + 1];
if (!args.includes('--destination')) throw new Error('--destination requires a new absolute directory');
const destination = resolve(arg('--destination'));
if (existsSync(destination)) throw new Error('destination_exists');
mkdirSync(destination, { mode: 0o700 });
const packageRoot = new URL('../', import.meta.url).pathname;
const pins = JSON.parse(readFileSync(join(packageRoot, 'PINS.json'), 'utf8'));
const logs = join(destination, 'logs'); mkdirSync(logs);
const records = [];
function run(label, command, argv, options = {}) {
  const result = spawnSync(command, argv, { cwd: destination, env: process.env, encoding: 'utf8', maxBuffer: 4 * 1048576, ...options });
  writeFileSync(join(logs, `${label}.log`), `${result.stdout || ''}${result.stderr || ''}`);
  records.push({ label, command: [command, ...argv], exit: result.status });
  if (result.status !== 0) throw new Error(`${label}_failed_see_private_install_log`);
  return result.stdout;
}
try {
  const mounts = {};
  for (const [name, input] of Object.entries(pins.inputs)) {
    const checkout = join(destination, `${name}-input`);
    run(`${name}-init`, 'git', ['init', '-q', checkout]);
    run(`${name}-origin`, 'git', ['-C', checkout, 'remote', 'add', 'origin', input.repo]);
    run(`${name}-fetch`, 'git', ['-C', checkout, 'fetch', '-q', '--filter=blob:none', '--depth=1', 'origin', input.commit]);
    if (name === 'gateway' || name === 'sds') {
      run(`${name}-sparse-init`, 'git', ['-C', checkout, 'sparse-checkout', 'init', '--no-cone']);
      run(`${name}-sparse-paths`, 'git', ['-C', checkout, 'sparse-checkout', 'set', '--no-cone',
        ...(name === 'gateway' ? ['/services/machine-gateway/'] : ['/tools/ae14-compat-maintenance/', '/tools/recurring-job-recipes/', '/tools/result-reuse/'])]);
    }
    run(`${name}-checkout`, 'git', ['-C', checkout, 'checkout', '-q', '--detach', input.commit]);
    mounts[name] = input.mountSubdir ? join(checkout, input.mountSubdir) : checkout;
  }
  for (const [name, root] of [['merchant', mounts.merchant], ['customer', join(mounts.merchant, 'examples/customer-x402')], ['gateway', mounts.gateway]]) {
    run(`${name}-install`, 'npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', root]);
  }
  const archives = join(destination, 'archives'); mkdirSync(archives);
  const packed = JSON.parse(run('pack', 'npm', ['pack', packageRoot, '--ignore-scripts', '--json', '--pack-destination', archives]));
  const consumer = join(destination, 'consumer'); mkdirSync(consumer);
  writeFileSync(join(consumer, 'package.json'), '{"name":"ae18-cold-consumer","private":true,"type":"module"}\n');
  run('consumer-install', 'npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', consumer, join(archives, packed[0].filename)]);
  const installed = join(consumer, 'node_modules/@samedaydesk/maintenance-delivery');
  const env = { ...process.env, SDS_INPUT_ROOT: mounts.sds, GATEWAY_INPUT_ROOT: mounts.gateway, MERCHANT_INPUT_ROOT: mounts.merchant };
  const acceptance = join(destination, 'acceptance.json');
  run('acceptance', process.execPath, [join(installed, 'bin/accept.mjs'), acceptance], { env });
  const evidence = JSON.parse(readFileSync(acceptance, 'utf8'));
  if (evidence.handbackReceipt?.output?.acceptance !== 'accepted' || evidence.exactReadback !== true || evidence.effects?.paidTaskIncrement !== 0) throw new Error('acceptance_content_failed');
  writeFileSync(join(destination, 'install-receipt.json'), `${JSON.stringify({ ok: true, destination, mounts, installed,
    archive: packed[0].filename, archiveSha256: createHash('sha256').update(readFileSync(join(archives, packed[0].filename))).digest('hex'), records, acceptance }, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ ok: true, destination, acceptance })}\n`);
} catch (error) {
  writeFileSync(join(destination, 'install-receipt.json'), `${JSON.stringify({ ok: false, records, error: error.message }, null, 2)}\n`);
  throw error;
}
