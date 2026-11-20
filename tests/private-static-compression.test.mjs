import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { get } from 'node:http';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import express from 'express';
import { mountProductionClient } from '../server/lib/spa-client.js';

test('built SameDayDesk documents and CSS keep their contents under negotiated static compression', async (t) => {
  const dist = resolve('client/dist');
  const html = await readFile(resolve(dist, 'index.html'));
  const cssPath = html.toString('utf8').match(/<link\b[^>]*rel="stylesheet"[^>]*href="(\/assets\/[^"]+\.css)"/)?.[1];
  assert.ok(cssPath, 'production HTML must name its compiled style');
  const css = await readFile(resolve(dist, '.' + cssPath));
  const app = express();
  const apiBody = 'independent response '.repeat(140);
  app.get('/api/disposable-compression-proof', (_req, res) => res.type('text/plain').send(apiBody));
  mountProductionClient(app, dist);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((done) => server.close(done)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, headers) => new Promise((done, reject) => {
    const req = get(base + path, { headers }, (response) => {
      const chunks = [];
      response.on('data', (bytes) => chunks.push(bytes));
      response.on('error', reject);
      response.on('end', () => done({ status: response.statusCode, headers: response.headers, bytes: Buffer.concat(chunks) }));
    });
    req.setTimeout(3000, () => req.destroy(new Error('private HTTP timeout')));
    req.on('error', reject);
  });
  for (const [path, expected] of [['/', html], [cssPath, css]]) {
    const plain = await request(path, { 'Accept-Encoding': 'identity' });
    assert.equal(plain.status, 200);
    assert.equal(plain.headers['content-encoding'], undefined);
    assert.deepEqual(plain.bytes, expected);
    for (const [encoding, decode] of [['gzip', gunzipSync], ['br', brotliDecompressSync]]) {
      const compressed = await request(path, { 'Accept-Encoding': encoding });
      assert.equal(compressed.status, 200);
      assert.equal(compressed.headers['content-encoding'], encoding);
      assert.match(compressed.headers.vary ?? '', /\bAccept-Encoding\b/i);
      assert.deepEqual(decode(compressed.bytes), expected);
      assert.ok(compressed.bytes.length < plain.bytes.length, `${path} should transfer fewer bytes`);
    }
  }
  const range = await request(cssPath, { 'Accept-Encoding': 'br', Range: 'bytes=0-19' });
  assert.equal(range.status, 206);
  assert.equal(range.headers['content-encoding'], undefined);
  assert.deepEqual(range.bytes, css.subarray(0, 20));
  const api = await request('/api/disposable-compression-proof', { 'Accept-Encoding': 'gzip' });
  assert.equal(api.headers['content-encoding'], undefined);
  assert.equal(api.bytes.toString(), apiBody);
});
