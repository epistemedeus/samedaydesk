import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, request } from 'node:http';
import { createRequire } from 'node:module';
import test from 'node:test';
import { deflateSync, gzipSync } from 'node:zlib';
import { createSdsApp } from '../app.js';

const require = createRequire(import.meta.url);
const fromExpress = createRequire(require.resolve('express/package.json'));

test('Express loads the corrected body-parser line', () => {
  const { version } = fromExpress('body-parser/package.json');
  const [major, minor] = version.split('.').map(Number);
  assert.ok(major === 2 && minor >= 4, `unexpected body-parser ${version}`);
});

test('the ordinary SDS parser accepts gzip and isolates malformed bodies', { timeout: 10_000 }, async t => {
  const server = createSdsApp().listen(0, '127.0.0.1');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const send = body => fetch(`${origin}/api/test-compressed-request-not-a-route`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' },
    body, signal: AbortSignal.timeout(3000),
  });

  const valid = await send(gzipSync(JSON.stringify({ fixture: true })));
  assert.equal(valid.status, 404);
  assert.deepEqual(await valid.json(), { error: 'Not found' });

  const invalid = await send(Buffer.from('not a gzip body'));
  assert.equal(invalid.status, 400);
  await invalid.arrayBuffer();

  const healthy = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(3000) });
  assert.equal(healthy.status, 200);
  assert.equal((await healthy.json()).ok, true);
});

test('the installed app drains a late compressed upload and remains available', { timeout: 10_000 }, async t => {
  const app = createSdsApp();
  const drained = Promise.withResolvers();
  const finalChunk = Buffer.alloc(32);
  const firstChunk = Buffer.concat([deflateSync('{"fixture":true}'), Buffer.alloc(1)]);
  let upload;
  const server = createServer((req, res) => {
    if (req.method === 'POST') {
      req.once('end', drained.resolve);
      // Make the final bytes arrive after the real application responds, not
      // in the same buffer as the valid compressed frame.
      res.once('finish', () => upload.end(finalChunk));
    }
    app(req, res);
  }).listen(0, '127.0.0.1');
  t.after(async () => {
    upload?.destroy();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const status = await new Promise((resolve, reject) => {
    upload = request(`${origin}/api/test-compressed-request-not-a-route`, {
      method: 'POST',
      agent: false,
      signal: AbortSignal.timeout(3000),
      headers: {
        connection: 'keep-alive',
        'content-type': 'application/json',
        'content-encoding': 'deflate',
        'content-length': firstChunk.length + finalChunk.length,
      },
    }, res => {
      res.once('error', reject);
      res.once('end', () => resolve(res.statusCode));
      res.resume();
    });
    upload.once('error', reject);
    upload.write(firstChunk);
  });
  assert.equal(status, 404);
  await drained.promise;
  const healthy = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(3000) });
  assert.equal(healthy.status, 200);
  assert.equal((await healthy.json()).ok, true);
});
