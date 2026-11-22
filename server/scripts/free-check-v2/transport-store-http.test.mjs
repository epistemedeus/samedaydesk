import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { mkdtemp, readFile, stat, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchPublicBounded, setTransportForTests } from '../../lib/agent-readiness/bounded-fetch.js';
import { runFreeCheck } from '../../lib/free-check-v2/probe.js';
import { freeCheckHttp } from '../../lib/free-check-v2/http.js';
import { readReport, storeReport } from '../../lib/free-check-v2/store.js';
import { resetRateLimits } from '../../lib/agent-readiness/rate-limit.js';
const lookup = async () => [{ address: '1.1.1.1', family: 4 }];

test('bounded HEAD preserves DNS admission, safe headers and explicit public user-agent', async () => {
  const calls = [];
  setTransportForTests(async (url, options) => {
    calls.push({ url: url.href, ...options });
    return { status: 200, body: '', headers: { 'content-type': 'text/html', 'set-cookie': 'PRIVATE_COOKIE', 'payment-required': 'PUBLIC_CHALLENGE' } };
  });
  try {
    const response = await fetchPublicBounded('https://site.example/', { method: 'HEAD', userAgent: 'OAI-SearchBot/1.0', includeHeaders: true, lookup });
    assert.equal(calls[0].method, 'HEAD'); assert.equal(calls[0].address.address, '1.1.1.1');
    assert.equal(calls[0].userAgent, 'OAI-SearchBot/1.0'); assert.equal(response.headers['set-cookie'], undefined);
    assert.equal(response.headers['payment-required'], 'PUBLIC_CHALLENGE');
    await assert.rejects(fetchPublicBounded('http://127.0.0.1/', { lookup }));
    await assert.rejects(fetchPublicBounded('https://site.example/', { method: 'POST', lookup }));
    await assert.rejects(fetchPublicBounded('https://site.example/', { userAgent: 'bad\r\nX-Header: bad', lookup }));
    assert.equal(calls.length, 1);
  } finally { setTransportForTests(); }
});
test('HEAD redirects are re-admitted and a DNS-private destination is never exchanged', async () => {
  const calls = [];
  setTransportForTests(async (url) => { calls.push(url.href); return { status: 302, headers: { location: 'http://127.0.0.1/' }, body: '' }; });
  try {
    await assert.rejects(fetchPublicBounded('https://site.example/', { method: 'HEAD', lookup }));
    assert.deepEqual(calls, ['https://site.example/']);
    await assert.rejects(fetchPublicBounded('https://site.example/', { lookup: async () => [{ address: '10.0.0.1', family: 4 }] }));
    assert.equal(calls.length, 1);
  } finally { setTransportForTests(); }
});
test('one real total deadline bounds an unresponsive transport and produces unknowns, without retries', { timeout: 23_000 }, async () => {
  let calls = 0;
  const start = Date.now();
  const report = await runFreeCheck('https://slow.example/', { cruxKey: null, fetcher: (_url, options) => new Promise((_, reject) => {
    calls += 1;
    if (options.budget.signal.aborted) reject(Error('aborted'));
    else options.budget.signal.addEventListener('abort', () => reject(Error('aborted')), { once: true });
  }) });
  assert.equal(calls, 1); assert.ok(Date.now() - start < 20_000);
  assert.equal(report.checks.find((finding) => finding.id === 'fetch').status, 'unknown');
});
test('permalinks round-trip exact versioned results through private files and reject traversal or symlinks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sds-freecheck-store-'));
  try {
    const report = await storeReport({ version: 2, url: 'https://site.example/', checks: [], score: 55 }, { dir });
    assert.match(report.id, /^[a-f0-9]{32}$/); assert.equal((await stat(join(dir, `${report.id}.json`))).mode & 0o777, 0o600);
    assert.deepEqual(await readReport(report.id, { dir }), report);
    assert.equal(await readReport('../private', { dir }), null);
    const alias = '0'.repeat(32); await symlink(join(dir, `${report.id}.json`), join(dir, `${alias}.json`));
    assert.equal(await readReport(alias, { dir }), null);
    assert.equal((await readFile(join(dir, `${report.id}.json`), 'utf8')).includes('version'), true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('HTTP streams actual progress before the stored result, records once, and reads the permalink', async () => {
  resetRateLimits(); const events = [], reports = new Map();
  const app = express();
  app.get('/api/tools/ai-readiness', (req, res) => freeCheckHttp(req, res, (outcome) => events.push(outcome), {
    run: async (_input, { onProgress }) => { onProgress?.({ kind: 'finding', label: 'Public fetch', detail: 'HTTP 200' }); await new Promise((resolve) => setTimeout(resolve, 30)); return { version: 2, checks: [], score: 60 }; },
    store: async (report) => { const saved = { ...report, id: '1'.repeat(32) }; reports.set(saved.id, saved); return saved; },
    read: async (id) => reports.get(id),
  }));
  const server = http.createServer(app); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(base + '/api/tools/ai-readiness?version=2&stream=1&url=https://site.example/');
    assert.equal(response.headers.get('content-type').startsWith('text/event-stream'), true);
    const stream = await response.text(); assert.ok(stream.indexOf('event: progress') < stream.indexOf('event: result'));
    assert.deepEqual(events, ['completed']);
    const saved = await fetch(base + '/api/tools/ai-readiness?version=2&report=' + '1'.repeat(32));
    assert.equal((await saved.json()).score, 60);
    const missing = await fetch(base + '/api/tools/ai-readiness?version=2&report=missing'); assert.equal(missing.status, 404);
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
});
test('a report storage failure returns the completed check with an explicit missing-permalink notice', async () => {
  resetRateLimits(); const app = express();
  app.get('/', (req, res) => freeCheckHttp(req, res, () => {}, { run: async () => ({ version: 2, checks: [] }), store: async () => { throw Error('disk unavailable'); } }));
  const server = http.createServer(app); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/?version=2&url=https://site.example/`);
    const result = await response.json(); assert.equal(result.permalink, null); assert.match(result.storageNotice, /could not be saved/);
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
});
