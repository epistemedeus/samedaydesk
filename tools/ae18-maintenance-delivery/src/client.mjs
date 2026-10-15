import { readFileSync, writeFileSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { canonical, digest, requireThat, readJson } from './inputs.mjs';

async function json(url, credential, body, key) {
  const response = await fetch(url, { method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(20000),
    headers: { authorization: `Bearer ${credential}`, ...(body ? { 'content-type': 'application/json' } : {}), ...(key ? { 'idempotency-key': key } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = await response.json();
  requireThat(response.ok, value.error?.code || 'gateway_request_failed');
  return value;
}
// Persist the bound quote and key before sending. A lost response resumes the
// exact operation. New source/task/authority or gateway origin requires a new file.
export async function executeSaved({ baseUrl, credentialFile, stateFile, routeId, input, resume = false }) {
  const url = new URL(baseUrl);
  requireThat(!url.username && !url.password && !url.search && !url.hash &&
    (url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === '127.0.0.1')), 'gateway_url_refused');
  const credential = readFileSync(credentialFile, 'utf8').trim();
  const binding = { baseUrl, credentialDigest: digest(credential), routeId, input };
  let state;
  if (resume) {
    state = readJson(stateFile);
    requireThat(canonical(state.binding) === canonical(binding), 'saved_operation_binding_mismatch');
  } else {
    const fd = openSync(stateFile, 'wx', 0o600);
    try {
      const quote = await json(`${baseUrl}/v1/quote`, credential, { routeId, input });
      requireThat(quote.executable && quote.price.amount === 0 && quote.tenantBound, 'free_quote_required');
      state = { binding, body: { quoteId: quote.quoteId, input, maxUnits: 0 },
        key: `maintenance-${digest(binding)}` };
      writeFileSync(fd, `${JSON.stringify(state)}\n`); fsyncSync(fd);
    } finally { closeSync(fd); }
  }
  return json(`${baseUrl}/v1/execute`, credential, state.body, state.key);
}
export async function readback({ baseUrl, credentialFile, receiptId }) {
  requireThat(/^[a-f0-9-]{36}$/.test(receiptId), 'invalid_receipt_id');
  return json(`${baseUrl}/v1/receipts/${receiptId}`, readFileSync(credentialFile, 'utf8').trim());
}
