#!/usr/bin/env node
// Test harness only, adapted from VF02's private-cluster runner. No system service.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import net from 'node:net';
const moduleRoot = fileURLToPath(new URL('../', import.meta.url));
const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const extracted = join(moduleRoot, '.local/pg');
const bin = resolve(process.env.VF05_PG_BIN ?? join(extracted, 'usr/lib/postgresql/16/bin'));
if (!existsSync(join(bin, 'initdb'))) throw Error('VF05_PG_BIN or owned .local/pg extraction required');
mkdirSync(join(moduleRoot, '.local'), { recursive: true });
const local = mkdtempSync(join(moduleRoot, '.local/cluster-'));
const env = { ...process.env, LD_LIBRARY_PATH: `${join(extracted, 'usr/lib/x86_64-linux-gnu')}${process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : ''}`, TMPDIR: join(moduleRoot, '.local/tmp') };
mkdirSync(env.TMPDIR, { recursive: true });
const data = join(local, 'data'), password = randomBytes(24).toString('hex');
const probe = net.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
const port = probe.address().port; await new Promise(r => probe.close(r));
writeFileSync(join(local, 'password'), password, { mode: 0o600 });
let started = false, child, cleaned = false;
function cleanup() {
  if (cleaned) return; cleaned = true;
  if (started) { try { execFileSync(join(bin, 'pg_ctl'), ['-D', data, '-m', 'immediate', '-w', '-t', '10', 'stop'], { env, timeout: 15000, stdio: 'pipe' }); } catch { console.error('Owned test cluster cleanup failed'); return; } }
  rmSync(local, { recursive: true, force: true });
}
process.on('exit', cleanup);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { child?.kill('SIGKILL'); cleanup(); process.exit(124); });
try {
  execFileSync(join(bin, 'initdb'), ['-D', data, '-U', 'vf05_test_owner', '--pwfile', join(local, 'password'), '--auth-host=scram-sha-256', '--auth-local=trust', '--encoding=UTF8', '--no-locale'], { env, timeout: 30000, stdio: 'pipe' });
  writeFileSync(join(data, 'postgresql.auto.conf'), `listen_addresses='127.0.0.1'\nport=${port}\nunix_socket_directories=''\nmax_connections=24\nshared_buffers='32MB'\nfsync=on\nsynchronous_commit=on\ntimezone='UTC'\n`);
  started = true;
  execFileSync(join(bin, 'pg_ctl'), ['-D', data, '-l', join(local, 'postgres.log'), '-w', '-t', '15', 'start'], { env, timeout: 20000, stdio: 'pipe' });
  console.log('VF05 isolated disposable PostgreSQL; loopback; 24 connections; fsync=on; separate HTTP server processes');
  const databaseUrl = `postgresql://vf05_test_owner:${password}@127.0.0.1:${port}/postgres`;
  const args = ['--test', '--test-concurrency=1', '--test-timeout=120000', 'scripts/visitor-foundry/participation/tests/pg/integration.test.mjs'];
  child = spawn(process.execPath, args, { cwd: repo, env: { ...env, VF02_TEST_DATABASE_URL: databaseUrl, VF02_TEST_SCHEMA: `vf02_vf05_${process.pid}` }, stdio: 'inherit' });
  const timer = setTimeout(() => child.kill('SIGKILL'), 180000);
  const [code, signal] = await once(child, 'exit'); clearTimeout(timer); process.exitCode = signal ? 124 : code;
} finally { cleanup(); }
