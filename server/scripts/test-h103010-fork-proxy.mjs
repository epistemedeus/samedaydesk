import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import {providerError, startReadOnlyForkProxy} from './h103010-read-only-fork-proxy.mjs';

function listen(handler) {
  const server = http.createServer(handler);
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}
async function rpc(url, method, params, id = 1) {
  const response = await fetch(url, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id, method, params})});
  return response.json();
}

test('provider error keeps the endpoint code, message and data', () => {
  assert.deepEqual(providerError(429, {code: -32007, message: '25/second request limit reached'}), {code: -32007, message: '25/second request limit reached'});
  assert.deepEqual(providerError(200, {error: {code: -32005, message: 'historical state', data: '0xabc'}}), {code: -32005, message: 'historical state', data: '0xabc'});
  assert.equal(providerError(500, null).code, -32603);
  assert.notEqual(providerError(429, {code: -32007, message: '25/second request limit reached'}).code, -32000);
});

test('paced proxy preserves a limit error and does not forward probes', async () => {
  const seen = [];
  let open = 0;
  let maxOpen = 0;
  const upstream = await listen(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const started = Date.now();
    open += 1;
    maxOpen = Math.max(maxOpen, open);
    await new Promise(resolve => setTimeout(resolve, 200));
    open -= 1;
    seen.push({method: body.method, started});
    if (body.method === 'eth_call') {
      res.writeHead(429, {'content-type': 'application/json'});
      res.end(JSON.stringify({code: -32007, message: '25/second request limit reached'}));
      return;
    }
    if (body.method === 'eth_getStorageAt') {
      res.writeHead(200, {'content-type': 'application/json'});
      res.end(JSON.stringify({jsonrpc: '2.0', id: body.id, error: {code: -32005, message: 'historical state', data: '0xabc'}}));
      return;
    }
    res.writeHead(200, {'content-type': 'application/json'});
    res.end(JSON.stringify({jsonrpc: '2.0', id: body.id, result: '0x2105'}));
  });
  const proxy = await startReadOnlyForkProxy({upstream: 'http://127.0.0.1:' + upstream.address().port, gapMs: 50, timeoutMs: 2000});
  try {
    const parallel = await Promise.all([1, 2, 3, 4].map(id => rpc(proxy.url, 'eth_chainId', [], id)));
    assert.deepEqual(parallel.map(body => body.result), ['0x2105', '0x2105', '0x2105', '0x2105']);
    const starts = seen.slice(0, 4).map(row => row.started);
    for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= 40, 'starts were not spaced');
    assert.ok(maxOpen >= 2, 'spacing is not a single-flight retry');
    const limited = await rpc(proxy.url, 'eth_call', [{to: '0x8612dfdc421f80336cd14e8ef9cb1e765db5ab88', data: '0xccdafa11'}, '0x32f0133']);
    assert.deepEqual(limited.error, {code: -32007, message: '25/second request limit reached'});
    const stored = await rpc(proxy.url, 'eth_getStorageAt', ['0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', '0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3', {blockHash: '0x6f50eea711bc1a20239c6a9350e44a2f7f3ae96432ffb3a8f1946252a3429e79'}]);
    assert.deepEqual(stored.error, {code: -32005, message: 'historical state', data: '0xabc'});
    const probe = await rpc(proxy.url, 'eth_getAccountInfo', ['0x0000000000000000000000000000000000000001']);
    const info = await rpc(proxy.url, 'anvil_nodeInfo', []);
    const send = await rpc(proxy.url, 'eth_sendRawTransaction', ['0x00']);
    assert.equal(probe.error.code, -32601);
    assert.equal(info.error.code, -32601);
    assert.equal(send.error.code, -32601);
    assert.deepEqual(seen.map(row => row.method).filter(method => method === 'eth_getAccountInfo' || method === 'anvil_nodeInfo' || method === 'eth_sendRawTransaction'), []);
    assert.equal(proxy.stats.optionalProbes.length, 2);
    assert.equal(proxy.stats.denied.length, 1);
    assert.equal(proxy.stats.failures.length, 2);
  } finally {
    await proxy.close();
    upstream.closeAllConnections();
    await new Promise(resolve => upstream.close(resolve));
  }
});
