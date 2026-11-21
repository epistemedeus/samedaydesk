import http from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { MonitorStore } from '../src/store.mjs';

export { delay };
const exec = promisify(execFile);
const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
export async function harness({ originHandler, options = {} } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'neo-monitor-'));
  const state = { price: 10, requests: 0, mode: 'normal' };
  const origin = http.createServer((req, res) => {
    state.requests++;
    if (originHandler) return originHandler(req, res, state);
    if (state.mode === 'timeout') return;
    if (state.mode === 'partial') {
      res.writeHead(200, { 'content-type': 'application/json', 'content-length': 100 });
      res.write('{"price":'); return res.destroy();
    }
    if (state.mode === 'missing') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{}'); }
    if (state.mode === 'redirect') { res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' }); return res.end(); }
    const etag = `"price-${state.price}"`;
    if (req.headers['if-none-match'] === etag) { res.writeHead(304); return res.end(); }
    res.writeHead(200, { 'content-type': 'application/json', etag });
    res.end(JSON.stringify({ price: state.price, recipient: 'public-desk' }));
  });
  await new Promise(resolve => origin.listen(0, '127.0.0.1', resolve));
  const mountedOrigin = `http://127.0.0.1:${origin.address().port}`;
  const token = randomBytes(32).toString('base64url'), readerToken = randomBytes(32).toString('base64url');
  const opts = { demo: true, mountedOrigin, minIntervalMs: 120, sourceCooldownMs: 120,
    originCooldownMs: 10, visibilityMs: 120, leaseSlackMs: 100, ...options };
  const database = path.join(directory, 'store.sqlite'), configFile = path.join(directory, 'runtime.json');
  await writeFile(configFile, JSON.stringify({ database, port: 0, options: opts }), { mode: 0o600 });
  const store = new MonitorStore(database, opts);
  store.provision({ id: 'customer', token, readerToken }); store.close();
  let child, base;
  const start = async () => {
    child = spawn(process.execPath, [cli, 'serve', '--config', configFile], { env: { ...process.env, NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let buffer = '', errors = '';
    child.stderr.on('data', chunk => { errors += chunk.toString(); });
    base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('API readiness timeout')), 5000);
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`API exited ${code}: ${errors}`)); });
      child.stdout.on('data', chunk => {
        buffer += chunk.toString();
        if (buffer.includes('\n')) {
          try { const ready = JSON.parse(buffer.split('\n')[0]); clearTimeout(timer); resolve(`http://${ready.host}:${ready.port}`); }
          catch (error) { clearTimeout(timer); reject(error); }
        }
      });
    });
  };
  const stop = async () => {
    if (!child || child.exitCode !== null) return;
    const ended = once(child, 'exit'); child.kill('SIGTERM'); await ended;
  };
  await start();
  const api = async (route, { method = 'GET', body, key, credential = token } = {}) => {
    const response = await fetch(`${base}${route}`, { method, headers: {
      authorization: `Bearer ${credential}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(key ? { 'idempotency-key': key } : {}),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  return {
    state, origin, mountedOrigin, token, readerToken, configFile, database, opts, api,
    get base() { return base; },
    async create(patch = {}, key = randomBytes(12).toString('hex')) {
      return api('/v1/monitors', { method: 'POST', key, body: {
        url: `${mountedOrigin}/resource`, mode: 'json', pointers: ['/price'], intervalMs: 120,
        budget: { timeoutMs: 200 }, ...patch,
      } });
    },
    async tick() {
      const result = await exec(process.execPath, [cli, 'tick', '--config', configFile], { timeout: 10000,
        env: { ...process.env, NODE_ENV: 'test' } });
      return JSON.parse(result.stdout);
    },
    async restart() { await stop(); await start(); },
    open() { return new MonitorStore(database, opts); },
    async close() {
      await stop(); origin.closeAllConnections(); await new Promise(resolve => origin.close(resolve));
      await rm(directory, { recursive: true, force: true });
    },
  };
}
