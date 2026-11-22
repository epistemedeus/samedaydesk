import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import { serve } from './preview-server.mjs';
const dist = resolve('client/dist');
const files = new Map([
  ['/', 'home'], ['/x402', 'x402'], ['/for-agents', 'for-agents'], ['/receipts', 'receipts'], ['/for-agents/useful-jobs', 'for-agents__useful-jobs'],
]);
function get(port, path, method = 'GET', headers = {}) {
  return new Promise((yes, no) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers }, r => {
      const chunks = []; r.on('data', b => chunks.push(b));
      r.on('end', () => yes({ status: r.statusCode, headers: r.headers, body: Buffer.concat(chunks) }));
    }); req.on('error', no); req.end();
  });
}
test('performance HTTP consumes the same public prerender files as production, including gzip', async t => {
  const server = serve(dist); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(r => server.close(r))); const port = server.address().port;
  for (const [path, file] of files) {
    const expected = await readFile(`${dist}/route-shells/.public-first-render/${file}.html`);
    const plain = await get(port, path); assert.equal(plain.status, 200); assert.deepEqual(plain.body, expected);
    assert.match(plain.body.toString(), /name="sdd-public-first-render"/); assert.doesNotMatch(plain.body.toString(), /<div id="root"><\/div>/);
    const zipped = await get(port, path, 'GET', { 'Accept-Encoding': 'gzip' }); assert.equal(zipped.headers['content-encoding'], 'gzip'); assert.deepEqual(gunzipSync(zipped.body), expected);
    const head = await get(port, path, 'HEAD'); assert.equal(head.status, 200); assert.equal(head.body.length, 0);
  }
});
test('all anonymous prerenders discover the existing fonts before styles; private/query views retain normal shells', async t => {
  const server = serve(dist); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(r => server.close(r))); const port = server.address().port;
  for (const [path] of files) {
    const r = await get(port, path); const html = r.body.toString();
    const fonts = [...html.matchAll(/<link rel="preload" as="font" href="([^"]+)" type="font\/woff2" crossorigin>/g)];
    assert.equal(fonts.length, 3, path);
    for (const font of fonts) { assert.ok(font.index < html.indexOf('<link rel="stylesheet"')); assert.ok((await readFile(dist + font[1])).length > 0); }
    const query = await get(port, path + '?selected=private'); assert.equal(query.status, 200); assert.doesNotMatch(query.body.toString(), /name="sdd-public-first-render"/);
  }
  for (const path of ['/care/buy?offer=agent_front_door', '/care/buy?offer=keep_it_working', '/checkout', '/login', '/signup']) {
    const r = await get(port, path); assert.equal(r.status, 200); assert.doesNotMatch(r.body.toString(), /name="sdd-public-first-render"/);
  }
  for (const path of ['/api/care/checkout', '/api/checkout']) assert.equal((await get(port, path, 'POST')).status, 404);
  assert.equal((await get(port, '/unknown-performance-page')).status, 404);
});
