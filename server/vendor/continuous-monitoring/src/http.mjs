import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { performance } from 'node:perf_hooks';
import { ServiceError, requireThat } from './errors.mjs';
import { publicAddress, targetUrl } from './policy.mjs';

function abortable(promise, signal) {
  if (signal.aborted) return Promise.reject(new ServiceError('aborted'));
  return new Promise((resolve, reject) => {
    const abort = () => reject(new ServiceError('aborted'));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
// One request, no redirects, credentials, cookies, proxies, decompression or retries.
// DNS answers are all checked, and the checked address is pinned at connect time.
export async function boundedGet(text, {
  mountedOrigin = null, timeoutMs = 5000, maxBytes = 65536, signal,
  lookup = dns.lookup, headers = {},
} = {}) {
  const start = performance.now();
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), timeoutMs);
  const combined = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
  let bytes = 0, requests = 0, status = null;
  try {
    const url = targetUrl(text, { mountedOrigin });
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const mounted = url.origin === mountedOrigin;
    const answers = isIP(host) ? [{ address: host, family: isIP(host) }]
      : await abortable(lookup(host, { all: true, verbatim: true }), combined);
    requireThat(answers.length > 0 && answers.length <= 32 && answers.every(answer => mounted
      ? answer.address === '127.0.0.1' : publicAddress(answer.address)), 'private_dns');
    const pinned = answers[0];
    const response = await new Promise((resolve, reject) => {
      if (combined.aborted) return reject(new ServiceError('aborted'));
      requests = 1;
      const req = (url.protocol === 'https:' ? https : http).request(url, {
        method: 'GET', agent: false, signal: combined, maxHeaderSize: 16384,
        lookup: (_hostname, options, callback) => {
          if (options.all) callback(null, [pinned]);
          else callback(null, pinned.address, pinned.family);
        },
        headers: { 'user-agent': 'NeoContinuousMonitor/0.1', accept: 'application/json, text/plain, text/html',
          'accept-encoding': 'identity', ...headers },
      }, res => {
        status = res.statusCode;
        const stop = code => { reject(new ServiceError(code)); res.destroy(); };
        if (status >= 300 && status < 400 && status !== 304) return stop('redirect_refused');
        if (status === 206 || res.headers['content-range']) return stop('partial_response');
        if (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') return stop('encoded_response');
        if (Number(res.headers['content-length']) > maxBytes) return stop('body_limit');
        const chunks = [];
        res.on('data', chunk => {
          // Retain at most maxBytes; account for all bytes seen, including rejected overflow.
          bytes += chunk.length;
          if (bytes > maxBytes) return stop('body_limit');
          chunks.push(chunk);
        });
        res.on('aborted', () => reject(new ServiceError('partial_response')));
        res.on('error', reject);
        res.on('end', () => {
          if (!res.complete) return reject(new ServiceError('partial_response'));
          const allowed = {};
          for (const key of ['content-type', 'etag', 'last-modified']) {
            // Validators can themselves carry secrets; keep only simple short values.
            const value = res.headers[key];
            if (typeof value === 'string' && value.length <= 128 && /^[\w\s"',:;./+()=-]+$/.test(value)) allowed[key] = value;
          }
          resolve({ body: Buffer.concat(chunks), headers: allowed, status });
        });
      });
      req.on('error', reject);
      req.end();
    });
    return { ...response, bytes, requests, durationMs: Math.ceil(performance.now() - start), failure: null };
  } catch (error) {
    const failure = signal?.aborted ? 'cancelled' : deadline.signal.aborted ? 'timeout'
      : error instanceof ServiceError ? error.code : 'source_unreachable';
    // Never persist raw exception text, response URLs/headers, IPs or request credentials.
    return { body: null, headers: {}, status, bytes, requests, durationMs: Math.ceil(performance.now() - start), failure };
  } finally { clearTimeout(timer); }
}
