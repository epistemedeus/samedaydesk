// Read-only gate in front of the public Base endpoint for an owned Anvil fork.
// Anvil's default fork reads are valid block-hash state reads. They also burst:
// one observed journey sent 38 of them in one second and 30 in 100ms. The
// public endpoint answers that burst with HTTP 429 and
// {"code":-32007,"message":"25/second request limit reached"}. Replacing that
// with JSON-RPC -32000 makes the client report "Missing or invalid parameters"
// and the funded handler report storage_failed before any signature.
// Starts are spaced at gapMs. A failed read is not retried. The provider's
// code, message and data are returned as received. anvil_nodeInfo and
// eth_getAccountInfo stay refused and are not forwarded.
import http from 'node:http';
import {appendFileSync} from 'node:fs';

export const PUBLIC_FORK_UPSTREAM = 'https://mainnet.base.org';
export const READ_METHODS = Object.freeze([
  'eth_chainId', 'net_version', 'web3_clientVersion', 'eth_getCode', 'eth_getStorageAt',
  'eth_getBalance', 'eth_getTransactionCount', 'eth_getProof', 'eth_getBlockByNumber',
  'eth_getBlockByHash', 'eth_getTransactionByHash', 'eth_getTransactionReceipt',
  'eth_getBlockTransactionCountByNumber', 'eth_getBlockTransactionCountByHash',
  'eth_getTransactionByBlockHashAndIndex', 'eth_getTransactionByBlockNumberAndIndex',
  'eth_call', 'eth_blockNumber', 'eth_feeHistory', 'eth_gasPrice', 'eth_maxPriorityFeePerGas',
  'eth_getLogs',
]);
export const REFUSED_UNFORWARDED = Object.freeze(['anvil_nodeInfo', 'eth_getAccountInfo']);
const allowed = new Set(READ_METHODS);
const probes = new Set(REFUSED_UNFORWARDED);

export function providerError(status, body) {
  const source = body?.error && typeof body.error === 'object' ? body.error
    : (body && Number.isInteger(body.code) && typeof body.message === 'string' ? body : null);
  if (!source) return {code: -32603, message: 'upstream_http_' + status};
  const error = {code: source.code, message: String(source.message).slice(0, 500)};
  if (Object.hasOwn(source, 'data') && source.data != null) {
    error.data = typeof source.data === 'string' ? source.data.slice(0, 2000) : source.data;
  }
  return error;
}

export async function startReadOnlyForkProxy({upstream, gapMs = 50, timeoutMs = 20000, logPath = null} = {}) {
  if (typeof upstream !== 'string' || !upstream) throw new Error('fork upstream required');
  if (!Number.isInteger(gapMs) || gapMs < 40 || gapMs > 1000) throw new Error('fork gap refused');
  const stats = {reads: {}, denied: [], optionalProbes: [], failures: []};
  let nextAt = 0;
  let timer = null;
  let pumping = false;
  const queue = [];
  function pump() {
    if (pumping) return;
    pumping = true;
    try {
      while (queue.length && Date.now() >= nextAt) {
        const job = queue.shift();
        nextAt = Date.now() + gapMs;
        Promise.resolve().then(job.work).then(job.resolve, job.reject);
      }
    } finally {
      pumping = false;
    }
    if (queue.length && !timer) timer = setTimeout(() => { timer = null; pump(); }, Math.max(0, nextAt - Date.now()));
  }
  function pace(work) {
    return new Promise((resolve, reject) => {
      queue.push({work, resolve, reject});
      pump();
    });
  }
  function record(row) {
    if (logPath) appendFileSync(logPath, JSON.stringify(row) + '\n');
  }
  async function forward(msg) {
    const response = await fetch(upstream, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({jsonrpc: '2.0', id: msg.id ?? 1, method: msg.method, params: msg.params || []}),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = null; }
    const failed = response.status !== 200 || !body || body.error || !Object.hasOwn(body, 'result');
    record({at: new Date().toISOString(), method: msg.method, id: msg.id ?? null, params: msg.params ?? null, forwarded: true, upstreamStatus: response.status, failed: Boolean(failed), upstreamBody: text.length > 500 ? {bytes: text.length, head: text.slice(0, 240)} : text});
    if (!failed) return {jsonrpc: '2.0', id: msg.id ?? null, result: body.result};
    const error = providerError(response.status, body);
    stats.failures.push({method: msg.method, upstreamStatus: response.status, error});
    return {jsonrpc: '2.0', id: msg.id ?? null, error};
  }
  async function reply(msg) {
    const method = msg?.method;
    if (typeof method !== 'string' || !allowed.has(method)) {
      const probe = probes.has(method);
      record({at: new Date().toISOString(), method: method ?? null, id: msg?.id ?? null, params: msg?.params ?? null, forwarded: false, optionalProbe: probe});
      (probe ? stats.optionalProbes : stats.denied).push({method: method ?? null, forwarded: false});
      return {jsonrpc: '2.0', id: msg?.id ?? null, error: {code: -32601, message: 'read_only_upstream'}};
    }
    stats.reads[method] = (stats.reads[method] || 0) + 1;
    try {
      return await pace(() => forward(msg));
    } catch (error) {
      const failure = {code: -32603, message: 'upstream_transport_failed'};
      record({at: new Date().toISOString(), method, id: msg.id ?? null, forwarded: true, transport: String(error.name || 'Error')});
      stats.failures.push({method, transport: String(error.name || 'Error'), error: failure});
      return {jsonrpc: '2.0', id: msg.id ?? null, error: failure};
    }
  }
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method !== 'POST') { res.writeHead(400); res.end(); return; }
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1048576) throw new Error('body_too_large');
        chunks.push(chunk);
      }
      const payload = JSON.parse(Buffer.concat(chunks).toString());
      const result = [];
      for (const msg of Array.isArray(payload) ? payload : [payload]) result.push(await reply(msg));
      res.writeHead(200, {'content-type': 'application/json'});
      res.end(JSON.stringify(Array.isArray(payload) ? result : result[0]));
    } catch {
      record({at: new Date().toISOString(), proxyException: true});
      if (!res.headersSent) { res.writeHead(400); res.end(); }
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    url: 'http://127.0.0.1:' + server.address().port,
    stats,
    async close() {
      if (timer) clearTimeout(timer);
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    },
  };
}
