// Only disposable local processes owned by this runner. Invoke under the host build flock.
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import net from 'node:net';
import { once } from 'node:events';

const exec = promisify(execFile), pgBin = process.env.AE18_POSTGRES_BIN || '/usr/lib/postgresql/16/bin';
const directory = await mkdtemp(path.join(tmpdir(), 'ae18-postgres-'));
const data = path.join(directory, 'data'), ca = path.join(directory, 'ca.pem');
const environment = { PATH: process.env.PATH, NODE_ENV: 'test' };
let started = false;
try {
  await exec('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(directory, 'ca.key'),
    '-out', ca, '-days', '1', '-subj', '/CN=AE18 disposable CA', '-addext', 'basicConstraints=critical,CA:TRUE']);
  await exec('openssl', ['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(directory, 'server.key'),
    '-out', path.join(directory, 'server.csr'), '-subj', '/CN=localhost']);
  await writeFile(path.join(directory, 'extensions'), 'subjectAltName=DNS:localhost\nbasicConstraints=CA:FALSE\nextendedKeyUsage=serverAuth\n');
  await exec('openssl', ['x509', '-req', '-in', path.join(directory, 'server.csr'), '-CA', ca, '-CAkey', path.join(directory, 'ca.key'),
    '-CAcreateserial', '-out', path.join(directory, 'server.pem'), '-days', '1', '-extfile', path.join(directory, 'extensions')]);
  await chmod(ca, 0o600); await chmod(path.join(directory, 'server.key'), 0o600);
  await exec(path.join(pgBin, 'initdb'), ['-D', data, '-U', 'postgres', '--auth=trust', '--no-locale', '--encoding=UTF8']);
  const reservation = net.createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  await writeFile(path.join(data, 'postgresql.auto.conf'), `
listen_addresses='127.0.0.1,::1'
port=${port}
unix_socket_directories='${directory}'
ssl=on
ssl_cert_file='${directory}/server.pem'
ssl_key_file='${directory}/server.key'
shared_buffers='32MB'
work_mem='1MB'
max_connections=16
max_wal_size='64MB'
`, { mode: 0o600 });
  await exec(path.join(pgBin, 'pg_ctl'), ['-D', data, '-l', path.join(directory, 'postgres.log'), '-w', 'start']); started = true;
  const child = spawn(process.execPath, ['--test', '--test-concurrency=1', ...[
    'server/lib/machine-services/test/integration.test.mjs',
  ]], { stdio: 'inherit', env: { ...environment,
    AE18_FIXTURE_DATABASE_URL: `postgres://postgres@localhost:${port}/postgres?sslmode=verify-full`, AE18_FIXTURE_CA_FILE: ca,
    AE18_FIXTURE_DIR: directory,
  } });
  const [exitCode] = await once(child, 'exit'); process.exitCode = exitCode ?? 1;
} finally {
  if (started) await exec(path.join(pgBin, 'pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop']);
  await rm(directory, { recursive: true, force: true });
}
