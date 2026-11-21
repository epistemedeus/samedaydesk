// One configured replay of the owned-fork funded journey.
// Starts the paced read-only proxy, then Anvil at the pinned fork block, then
// test-h103010-funded-fork.mjs. Child stdout and stderr are POSIX files under
// H103010_LOG_DIR. No retry loop, no second upstream, and no live key.
//
//   H103010_CAST=<cast> \
//   H103010_ANVIL=<anvil> \
//   H103010_FORK_BLOCK=53412211 \
//   H103010_LOG_DIR=<owned-posix-dir> \
//   H103010_OPERATOR_ENTRY=<companion>/src/open-machine-authority.mjs \
//   H103010_OPERATOR_COMMIT=<companion HEAD> \
//   H103010_CLIENT=<cold-requester-0.3.1.mjs> \
//   H103010_CLIENT_SHA256=<sha256> \
//   H103010_DESCRIPTOR=<descriptor.json> \
//   H103010_NODE_MODULES=<prepared node_modules> \
//   H103010_SDS_COMMIT=<this HEAD> \
//   node --max-old-space-size=768 server/scripts/h103010-owned-fork-replay.mjs
import {execFileSync, spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync, openSync, readFileSync, writeFileSync} from 'node:fs';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {PUBLIC_FORK_UPSTREAM, startReadOnlyForkProxy} from './h103010-read-only-fork-proxy.mjs';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error('missing ' + name);
  return value;
}
const logDir = required('H103010_LOG_DIR');
mkdirSync(logDir, {recursive: true, mode: 0o700});
const forkBlock = required('H103010_FORK_BLOCK');
if (!/^[1-9][0-9]{1,11}$/.test(forkBlock)) throw new Error('fork block refused');
const anvilBin = required('H103010_ANVIL');
const upstream = process.env.H103010_UPSTREAM || PUBLIC_FORK_UPSTREAM;
if (upstream !== PUBLIC_FORK_UPSTREAM) throw new Error('fork upstream refused');

function lease() {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}
async function rpc(url, method, params, timeoutMs) {
  const response = await fetch(url, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params}), signal: AbortSignal.timeout(timeoutMs)});
  return response.json();
}
function sha(file) { return createHash('sha256').update(readFileSync(file)).digest('hex'); }

const summary = {
  upstream,
  gapMs: 50,
  limitObserved: '25/second',
  forkBlock,
  anvil: {path: anvilBin, sha256: sha(anvilBin), version: execFileSync(anvilBin, ['--version'], {encoding: 'utf8'}).trim()},
  startedAt: new Date().toISOString(),
};
const proxy = await startReadOnlyForkProxy({upstream, gapMs: 50, logPath: logDir + '/proxy.jsonl'});
summary.proxyUrl = proxy.url;
const port = await lease();
const forkUrl = 'http://127.0.0.1:' + port;
summary.forkUrl = forkUrl;
const anvilArgs = ['--host', '127.0.0.1', '--port', String(port), '--chain-id', '8453', '--fork-url', proxy.url, '--fork-block-number', forkBlock, '--silent'];
summary.anvilArgs = anvilArgs;
const anvil = spawn(anvilBin, anvilArgs, {stdio: ['ignore', openSync(logDir + '/anvil.stdout.log', 'w'), openSync(logDir + '/anvil.stderr.log', 'w')]});
let anvilExit = null;
anvil.on('exit', (code, signal) => { anvilExit = {code, signal}; });
let test;
try {
  let ready = null;
  for (let i = 0; i < 80 && !anvilExit; i++) {
    try {
      const body = await rpc(forkUrl, 'eth_getBlockByNumber', ['latest', false], 2000);
      if (body.result?.hash) ready = {number: body.result.number, hash: body.result.hash, timestamp: body.result.timestamp};
      if (ready) break;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error('anvil_not_ready');
  summary.ready = ready;
  const finalized = await rpc(forkUrl, 'eth_getBlockByNumber', ['finalized', false], 5000);
  summary.finalized = finalized.result ? {number: finalized.result.number, hash: finalized.result.hash, timestamp: finalized.result.timestamp} : {error: finalized.error || null};
  summary.finality = 'anvil finalized is the owned fork head minus its local finality distance; it is not the public chain finalized tag';
  const env = {...process.env, TMPDIR: '/tmp/h103010-fork-pg', NODE_OPTIONS: '--max-old-space-size=768', H103010_FORK_URL: forkUrl};
  mkdirSync(env.TMPDIR, {recursive: true, mode: 0o700});
  test = spawn('/exec-daemon/node', ['--max-old-space-size=768', 'server/scripts/test-h103010-funded-fork.mjs'], {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    env,
    stdio: ['ignore', openSync(logDir + '/funded.stdout.log', 'w'), openSync(logDir + '/funded.stderr.log', 'w')],
  });
  const testExit = await new Promise(resolve => {
    const timer = setTimeout(() => { try { test.kill('SIGTERM'); } catch {} }, 600000);
    test.on('exit', (code, signal) => { clearTimeout(timer); resolve({code, signal}); });
  });
  summary.testExit = testExit;
  const stdout = readFileSync(logDir + '/funded.stdout.log');
  summary.fundedStdoutSha256 = createHash('sha256').update(stdout).digest('hex');
  process.stdout.write(stdout);
} finally {
  if (test && test.exitCode === null && !test.killed) { try { test.kill('SIGTERM'); } catch {} }
  try { anvil.kill('SIGTERM'); } catch {}
  await new Promise(resolve => setTimeout(resolve, 400));
  if (anvil.exitCode === null) { try { anvil.kill('SIGKILL'); } catch {} }
  await proxy.close();
  summary.anvilExit = anvilExit;
  summary.proxy = {reads: proxy.stats.reads, denied: proxy.stats.denied, optionalProbes: proxy.stats.optionalProbes.length, failures: proxy.stats.failures};
  summary.endedAt = new Date().toISOString();
  writeFileSync(logDir + '/summary.json', JSON.stringify(summary, null, 2));
}
if (summary.testExit?.code !== 0) process.exitCode = summary.testExit?.code || 1;
