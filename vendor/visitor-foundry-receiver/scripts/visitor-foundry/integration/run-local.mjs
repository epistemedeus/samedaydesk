#!/usr/bin/env node
// Adapted from VF02's private cluster lifecycle; private package location reused.
// Private cluster lifecycle. Never consumes DATABASE_URL or system PG services.
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import net from 'node:net';
import { once } from 'node:events';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const mode = process.argv[2] ?? 'test';
if (!['test', 'bench','compound','read-bench','entry'].includes(mode)) throw new Error('mode: test | bench');
const extracted = join(root, '.scratch/vf02-pg/extracted');
const bin = resolve(process.env.VF02_PG_BIN ?? join(extracted, 'usr/lib/postgresql/16/bin'));
if (!existsSync(join(bin, 'initdb'))) throw new Error('set VF02_PG_BIN to PostgreSQL bin, or follow README private package extraction');
const local = join(root, '.scratch', `vf04-cluster-${process.pid}-${randomBytes(4).toString('hex')}`);
mkdirSync(local, { recursive: true, mode: 0o700 });
const data = join(local, 'data');
const env = { ...process.env, LD_LIBRARY_PATH: `${join(extracted, 'usr/lib/x86_64-linux-gnu')}${process.env.LD_LIBRARY_PATH ? `:${process.env.LD_LIBRARY_PATH}` : ''}` };
const portServer = net.createServer();
portServer.listen(0, '127.0.0.1');
await once(portServer, 'listening');
const port = portServer.address().port;
await new Promise((r) => portServer.close(r));
const password = randomBytes(24).toString('hex');
writeFileSync(join(local, 'password'), password, { mode: 0o600 });
let started = false;
let child;
let cleaned = false;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  if (started) {
    try { execFileSync(join(bin, 'pg_ctl'), ['-D', data, '-m', 'immediate', '-w', '-t', '10', 'stop'], { env, timeout: 15000, stdio: 'pipe' }); }
    catch { console.error(`VF02 cluster stop failed; inspect only ${data}`); return; }
  }
  rmSync(local, { recursive: true, force: true });
}
process.on('exit', cleanup);
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { child?.kill('SIGKILL'); cleanup(); process.exit(124); });
try {
  execFileSync(join(bin, 'initdb'), ['-D', data, '-U', 'vf02_test_owner', '--pwfile', join(local, 'password'), '--auth-host=scram-sha-256', '--auth-local=trust', '--encoding=UTF8', '--no-locale'], { env, timeout: 30000, stdio: 'pipe' });
  writeFileSync(join(data, 'postgresql.auto.conf'), `listen_addresses='127.0.0.1'\nport=${port}\nunix_socket_directories=''\nmax_connections=24\nshared_buffers='32MB'\nwork_mem='2MB'\nfsync=on\nsynchronous_commit=on\ntimezone='UTC'\n`);
  started = true;
  execFileSync(join(bin, 'pg_ctl'), ['-D', data, '-l', join(local, 'postgres.log'), '-w', '-t', '15', 'start'], { env, timeout: 20000, stdio: 'pipe' });
  const databaseUrl = `postgresql://vf02_test_owner:${password}@127.0.0.1:${port}/postgres`;
  const schema = `vf04_${mode.replaceAll('-','_')}_${process.pid}`;
  const base = 'scripts/visitor-foundry/integration';
  const args = mode === 'entry' ? ['--test','--test-concurrency=1','--test-timeout=300000',`${base}/tests/entry.test.mjs`] : mode === 'compound' ? ['--test','--test-concurrency=1','--test-timeout=300000',`${base}/tests/compound.test.mjs`] : mode === 'read-bench' ? ['--test','--test-name-pattern=measured portable reads','--test-timeout=300000',`${base}/tests/compound.test.mjs`] : mode === 'test' ? ['--test', ...(process.env.VF04_TEST_NAME_PATTERN ? [`--test-name-pattern=${process.env.VF04_TEST_NAME_PATTERN}`] : []), '--test-concurrency=1', '--test-timeout=300000', ...(process.env.VF04_TEST_NAME_PATTERN ? [`${base}/tests/lifecycle.test.mjs`] : [`${base}/tests/integration.test.mjs`, `${base}/tests/lifecycle.test.mjs`])]
    : mode === 'regression' ? []
    : [`${base}/${mode}.mjs`];
  console.log(`VF04 private PostgreSQL: ${execFileSync(join(bin, 'postgres'), ['--version'], { env }).toString().trim()}; max_connections=24; shared_buffers=32MB; fsync=on; mode=${mode}`);
  if (mode === 'regression') {
    child = spawn('npm', ['test'], { cwd: join(root, 'services/correspondence'), env: { ...env, CORRESPONDENCE_TEST_DATABASE_URL: databaseUrl }, stdio: 'inherit' });
  } else child = spawn(process.execPath, args, { cwd: root, env: { ...env, VF04_TEST_DATABASE_URL: databaseUrl, VF04_TEST_SCHEMA: schema,...(mode==='read-bench'?{VF09_BENCH:'1'}:{}) }, stdio: 'inherit' });
  const timer = setTimeout(() => { child.kill('SIGKILL'); }, 600000);
  const [code, signal] = await once(child, 'exit');
  clearTimeout(timer);
  process.exitCode = signal ? 124 : code;
} finally { cleanup(); }
