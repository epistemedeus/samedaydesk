import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { publicAddress, targetUrl } from '../src/policy.mjs';
import { boundedGet } from '../src/http.mjs';
import { runtimeOptions } from '../src/config.mjs';

test('private, rebinding, mapped, translation and special-purpose IP ranges are refused', () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '0.0.0.0', '169.254.169.254', '100.100.100.200',
    '172.20.1.2', '192.168.1.1', '192.0.2.1', '198.18.0.1', '224.0.0.1', '255.255.255.255',
    '::1', '::ffff:127.0.0.1', '::ffff:8.8.8.8', 'fe80::1', 'fc00::1', 'ff02::1',
    '64:ff9b::7f00:1', '2002:7f00:1::', '2001:db8::1', '2001::1', '3fff::1']) assert.equal(publicAddress(address), false, address);
  for (const address of ['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111']) assert.equal(publicAddress(address), true, address);
});

test('caller URLs cannot select network exceptions, credentials, queries, opaque tokens, redirects or non-HTTPS ports', () => {
  for (const url of ['file:///etc/passwd', 'http://example.com/', 'https://example.com:444/',
    'https://u:p@example.com/', 'https://example.com/?token=private', 'https://example.com/#secret',
    'https://localhost/', 'https://metadata.google.internal/', 'https://2130706433/',
    'https://0x7f000001/', 'https://127.1/', 'https://example.com/%74oken/x',
    'https://example.com/api-key/x', `https://example.com/${'x'.repeat(81)}`]) {
    assert.throws(() => targetUrl(url), undefined, url);
  }
  assert.equal(targetUrl('https://example.com/public/prices.json').href, 'https://example.com/public/prices.json');
  assert.throws(() => runtimeOptions({ minIntervalMs: 1 }));
  assert.throws(() => runtimeOptions({ mountedOrigin: 'http://127.0.0.1:1234' }));
});

test('a mixed public/private DNS answer fails before an HTTP request; DNS deadline is bounded', async () => {
  let resolutions = 0;
  const rebinding = await boundedGet('https://public.example.com/', {
    lookup: async () => { resolutions++; return [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }]; },
  });
  assert.equal(resolutions, 1); assert.equal(rebinding.failure, 'private_dns'); assert.equal(rebinding.requests, 0);
  const stalled = await boundedGet('https://public.example.com/', { timeoutMs: 50, lookup: () => new Promise(() => {}) });
  assert.equal(stalled.failure, 'timeout'); assert.equal(stalled.requests, 0); assert.ok(stalled.durationMs < 1000);
});

test('real HTTP observation refuses redirect, partial, encoding, oversized, truncated and stalled bodies', async t => {
  let requests = 0;
  const server = http.createServer((req, res) => {
    requests++;
    if (req.url === '/redirect') { res.writeHead(302, { location: '/must-never-run' }); return res.end(); }
    if (req.url === '/partial') { res.writeHead(206, { 'content-range': 'bytes 0-2/10' }); return res.end('abc'); }
    if (req.url === '/encoded') { res.writeHead(200, { 'content-encoding': 'gzip' }); return res.end('abc'); }
    if (req.url === '/large') { res.writeHead(200, { 'content-length': 100000 }); return res.end('abc'); }
    if (req.url === '/stream') { res.writeHead(200); return res.end('a'.repeat(10000)); }
    if (req.url === '/truncated') { res.writeHead(200, { 'content-length': 100 }); res.write('short'); return res.destroy(); }
    if (req.url === '/stalled') { res.writeHead(200); res.flushHeaders(); return; }
    res.end('unexpected');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const [route, failure] of [['redirect', 'redirect_refused'], ['partial', 'partial_response'],
    ['encoded', 'encoded_response'], ['large', 'body_limit'], ['stream', 'body_limit'], ['stalled', 'timeout']]) {
    const result = await boundedGet(`${origin}/${route}`, { mountedOrigin: origin, maxBytes: 256, timeoutMs: 100 });
    assert.equal(result.failure, failure, route); assert.equal(result.requests, 1); assert.equal(result.body, null);
  }
  const truncated = await boundedGet(`${origin}/truncated`, { mountedOrigin: origin, maxBytes: 256 });
  assert.ok(['source_unreachable', 'partial_response'].includes(truncated.failure));
  assert.equal(requests, 7); // no redirect target, retries or secondary requests
  const blocked = await boundedGet(`${origin}/must-never-run`);
  assert.equal(blocked.requests, 0); assert.equal(requests, 7);
});
