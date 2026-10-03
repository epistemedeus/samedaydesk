// Receiving only: existing adapters on disposable PG, actual EIN fixture
// source and the owning declared merchant checkout. No production writes.
import { spawn } from 'node:child_process';
import { createWriteStream, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDisposablePg } from '../../../server/scripts/fixtures/disposable-pg.mjs';

if (!process.env.SOL384_EIN_SOURCE) throw Error('SOL384_EIN_SOURCE must name the isolated current EIN snapshot');
const root = fileURLToPath(new URL('../../../', import.meta.url));
const glob = (dir, match) => readdirSync(resolve(root, dir)).filter(match).map(name => `${dir}/${name}`);
const files = [
  ...glob('tools/hosted-useful-journey-100346/test', n => n.endsWith('.test.mjs')),
  ...glob('tools/relevant-activation-composition-100384/test', n => n.endsWith('.test.mjs')),
  ...glob('server/scripts/agent-readiness', n => n.endsWith('.test.js')),
  ...glob('tools/recurring-job-recipes/test', n => n.endsWith('.test.mjs')),
  ...glob('tools/result-reuse/test', n => n.endsWith('.test.mjs')),
  ...glob('experiments/s260-useful-jobs-public-integration/test', n => n.endsWith('.test.mjs')),
  ...['repair', 'task-readiness', 'public-install'].map(n => `tools/l08-agent-repair/test/${n}.test.mjs`),
  ...['test-public-readiness-mount', 'test-public-readiness-supplied', 'test-public-readiness-load-failure',
    'test-correspondence-mount-disabled', 'test-correspondence-shared-host-negative', 'test-correspondence-shared-host-accept', 'test-correspondence-s58',
    'test-foundry-host', 'test-foundry-probe', 'test-foundry-listener-drain', 'test-foundry-activation', 'test-foundry-client-compat',
    'test-foundry-entry-server', 'test-foundry-claimed-sigterm', 'test-hosted-startup', 'test-mcp-protocol-negotiation',
    'test-fixpack-entitlement', 'test-spa-fallback', 'test-spa-route-shells'].map(n => `server/scripts/${n}.js`),
  'scripts/public-entry.test.mjs',
  'experiments/codex-window/h25-offline147-promotion/test/public-facing-copy.test.mjs',
  'experiments/codex-window/h25-offline147-promotion/test/immutability-placement-binding.test.mjs',
];
const cluster = await startDisposablePg();
try {
  const log = createWriteStream(process.env.SDS_VISITOR_TEST_LOG || '/tmp/sds-visitor-261003-suite.log');
  const child = spawn(process.execPath, ['--experimental-strip-types', '--test', '--test-concurrency=1', ...files], {
    cwd: root, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CORRESPONDENCE_TEST_DATABASE_URL: cluster.url, PULSE_PG_BIN: '/usr/lib/postgresql/16/bin' },
  });
  child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
  let expired = false;
  const timer = setTimeout(() => { expired = true; try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 180000);
  const code = await new Promise((resolve, reject) => { child.once('close', resolve); child.once('error', reject); });
  clearTimeout(timer);
  await new Promise(resolve => log.end(resolve));
  process.stdout.write(JSON.stringify({ exitCode: code, expired, disposablePostgres: true, files: files.length }) + '\n');
  process.exitCode = expired ? 1 : code;
} finally { await cluster.stop(); }
