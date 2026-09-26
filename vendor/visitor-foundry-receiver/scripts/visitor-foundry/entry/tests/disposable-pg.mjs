import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const bin = process.env.VF10_PG_BIN ?? '/usr/lib/postgresql/16/bin';
const temp = mkdtempSync(join(tmpdir(), 'vf10-pg-'));
const net = createServer(); net.listen(0, '127.0.0.1'); await once(net, 'listening');
const port = net.address().port; await new Promise(r => net.close(r));
let started = false;
try {
  execFileSync(`${bin}/initdb`, ['-D', join(temp, 'data'), '-A', 'trust', '--no-locale', '-E', 'UTF8'], { stdio: 'ignore' });
  execFileSync(`${bin}/pg_ctl`, ['-D', join(temp, 'data'), '-l', join(temp, 'pg.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${temp} -c max_connections=32`, '-w', 'start'], { stdio: 'ignore' });
  started = true;
  const env = { ...process.env, VF10_TEST_DATABASE_URL: `postgresql://ubuntu@127.0.0.1:${port}/postgres`,
    VF10_TEST_SCRATCH: temp, CORRESPONDENCE_TEST_DATABASE_URL: `postgresql://ubuntu@127.0.0.1:${port}/postgres` };
  const args = process.argv.slice(2);
  const child = spawn(process.execPath, args.length ? args : ['--test', '--test-concurrency=1', `${root}tests/entry.test.mjs`], { env, stdio: 'inherit' });
  const [code] = await once(child, 'exit'); process.exitCode = code ?? 1;
} finally {
  if (started) execFileSync(`${bin}/pg_ctl`, ['-D', join(temp, 'data'), '-m', 'immediate', '-w', 'stop'], { stdio: 'ignore' });
  rmSync(temp, { recursive: true, force: true });
}
