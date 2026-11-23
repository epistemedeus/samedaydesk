import { createRequestBudget, withAbort } from '../agent-readiness/request-budget.js';
import { assertPublicHostname } from '../agent-readiness/ssrf.js';
import { looksLikeChallenge } from '../agent-readiness/retrieval.js';

export const RENDER_TIMEOUT_MS = 9_000;
export const RENDER_CACHE_MS = 86_400_000;
export const RENDER_SPACING_MS = 10_000;
export const RENDER_QUEUE_MS = 12_000;
const accounts = new Map(), MAX_CACHE = 256, MAX_RESPONSE = 2_500_000;

// Shared by callers in this process. Restarts reset these observations. No page text,
// credential or raw provider error is retained; these are not account-wide usage totals.
export function createRenderState({ now = () => Date.now(), monotonic = () => performance.now() } = {}) {
  return { now, monotonic, tail: Promise.resolve(), pending: 0, lastStart: -Infinity,
    day: -1, browserMs: 0, calls: 0, dailyStopped: false, cache: new Map() };
}
function day(state) {
  const current = Math.floor(state.now() / 86_400_000);
  if (current > state.day) Object.assign(state, { day: current, browserMs: 0, calls: 0, dailyStopped: false });
}
function measurement(state, reason, extra = {}) {
  day(state);
  return { status: 'not-verified', reason, providerRequests: 0, browserMsUsed: null,
    observedDay: new Date(state.day * 86_400_000).toISOString().slice(0, 10),
    observedDailyBrowserMs: state.browserMs, observedDailyRequests: state.calls,
    counterScope: 'process', accountTotalKnown: false, ...extra };
}
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
  });
}
async function jsonBounded(response) {
  if (!response.body?.getReader) return response.json(); // injected transport fixtures
  const reader = response.body.getReader(), chunks = []; let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.length; if (bytes > MAX_RESPONSE) throw Error('Response size limit.');
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
function cloudflareRenderer({ accountId, token, timeoutMs, fetchImpl, state }) {
  if (!/^[a-f0-9]{32}$/.test(accountId)) return null;
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-run/scrape?cacheTTL=0`;
  return async ({ url: raw, signal, initialWords = 0, emptyAppShell = true, budget }) => {
    let page;
    try {
      page = new URL(raw); page.username = ''; page.password = ''; page.hash = '';
      if (!['https:', 'http:'].includes(page.protocol)) throw Error('Public URL required.');
      assertPublicHostname(page.hostname);
    } catch { return { measurement: measurement(state, 'public-address-refused') }; }
    // Normal bounded-fetch has already admitted the final URL through its DNS/redirect guards.
    // The existing reading rule needs comparison only below 80 words of initial HTML.
    if (initialWords >= 80 || !emptyAppShell) return { measurement: measurement(state, initialWords >= 80 ? 'initial-html-sufficient' : 'no-empty-app-shell', { status: 'skipped' }) };
    const cached = () => {
      const entry = state.cache.get(page.href);
      if (!entry) return null;
      if (state.monotonic() >= entry.expires) { state.cache.delete(page.href); return null; }
      return { words: entry.words, extraWords: Math.max(0, entry.words - initialWords),
        measurement: measurement(state, 'positive-cache', { status: 'measured', cache: 'hit' }) };
    };
    const hit = cached(); if (hit) return hit;
    day(state);
    if (state.dailyStopped) return { measurement: measurement(state, 'daily-quota') };
    if (signal?.aborted) return { measurement: measurement(state, 'deadline') };
    if (state.pending >= 4) return { measurement: measurement(state, 'queue-full') };
    const remaining = () => Math.max(0, budget?.remaining() ?? 18_000);
    const queue = createRequestBudget(Math.min(RENDER_QUEUE_MS, remaining()), signal);
    const previous = state.tail; let release;
    const released = new Promise(resolve => { release = resolve; });
    // Canceled waiters must still follow their predecessor, preserving serialization.
    state.tail = previous.then(() => released); state.pending += 1;
    let call = null, attempted = false, browserMs = null;
    try {
      await withAbort(previous, queue.signal);
      const secondHit = cached(); if (secondHit) return secondHit;
      day(state);
      if (state.dailyStopped) return { measurement: measurement(state, 'daily-quota') };
      const wait = Math.max(0, state.lastStart + RENDER_SPACING_MS - state.monotonic());
      if (wait > queue.remaining()) return { measurement: measurement(state, 'queue-timeout') };
      if (wait) await sleep(wait, queue.signal);
      queue.signal.throwIfAborted(); queue.dispose();
      call = createRequestBudget(Math.min(timeoutMs, remaining()), signal);
      call.signal.throwIfAborted();
      state.lastStart = state.monotonic(); state.calls += 1; attempted = true;
      const response = await withAbort(fetchImpl(endpoint, {
        method: 'POST', signal: call.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ url: page.href, elements: [{ selector: 'body' }],
          rejectResourceTypes: ['image', 'media', 'font'],
          gotoOptions: { waitUntil: 'networkidle2', timeout: Math.max(1, Math.floor(call.remaining())) } }),
      }), call.signal);
      const usage = response.headers?.get('X-Browser-Ms-Used');
      if (typeof usage === 'string' && /^\d+(?:\.\d+)?$/.test(usage) && Number.isFinite(Number(usage)) && Number(usage) <= Number.MAX_SAFE_INTEGER - state.browserMs) {
        browserMs = Number(usage); state.browserMs += browserMs;
      }
      const data = await withAbort(jsonBounded(response), call.signal);
      const metadata = (reason, extra = {}) => measurement(state, reason, { providerRequests: 1, browserMsUsed: browserMs, cache: 'miss', ...extra });
      if (response.status === 429) {
        const daily = data.errors?.some(error => /browser time limit exceeded for today/i.test(String(error.message)));
        if (daily) state.dailyStopped = true;
        return { measurement: metadata(daily ? 'daily-quota' : 'rate-limit') };
      }
      if (!response.ok || data.success !== true) return { measurement: metadata('provider-unavailable') };
      const text = data.result?.[0]?.results?.[0]?.text;
      if (typeof text !== 'string' || !text.trim()) return { measurement: metadata('empty') };
      if (looksLikeChallenge({ status: 200, contentType: 'text/html', body: text })) return { measurement: metadata('challenge') };
      const words = text.trim().split(/\s+/u).length;
      state.cache.set(page.href, { words, expires: state.monotonic() + RENDER_CACHE_MS });
      if (state.cache.size > MAX_CACHE) state.cache.delete(state.cache.keys().next().value);
      return { words, extraWords: Math.max(0, words - initialWords), measurement: metadata('browser-comparison', { status: 'measured' }) };
    } catch {
      return { measurement: measurement(state, signal?.aborted || call?.signal.aborted ? 'deadline' : call ? 'provider-unavailable' : queue.signal.aborted ? 'queue-timeout' : 'provider-unavailable',
        { providerRequests: attempted ? 1 : 0, browserMsUsed: browserMs }) };
    } finally { queue.dispose(); call?.dispose(); state.pending -= 1; release(); }
  };
}

/** A complete CF configuration takes precedence. Missing either CF input preserves the
 * qualified remote-worker behavior and collectObservation's existing renderer interface. */
export function createRemoteRenderer({ url = process.env.FREE_CHECK_RENDER_URL, token = process.env.FREE_CHECK_RENDER_TOKEN,
  cfAccountId = process.env.FREE_CHECK_CF_ACCOUNT_ID, cfToken = process.env.FREE_CHECK_CF_TOKEN,
  timeoutMs = RENDER_TIMEOUT_MS, fetchImpl = fetch, state } = {}) {
  if (cfAccountId && cfToken) {
    if (!state) {
      if (!accounts.has(cfAccountId)) accounts.set(cfAccountId, createRenderState());
      state = accounts.get(cfAccountId);
    }
    return cloudflareRenderer({ accountId: cfAccountId, token: cfToken, timeoutMs, fetchImpl, state });
  }
  if (!url || !token) return null;
  const endpoint = new URL('/render', url);
  if (endpoint.protocol !== 'https:' && !/^(?:127\.0\.0\.1|localhost)$/.test(endpoint.hostname)) throw Error('The render worker must be reached over HTTPS.');
  return async ({ url: page, signal, initialWords = 0 }) => {
    const lifetime = createRequestBudget(timeoutMs, signal);
    try {
      const response = await withAbort(fetchImpl(endpoint, { method: 'POST', signal: lifetime.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ url: page, initialWords }) }), lifetime.signal);
      if (!response.ok) throw Error(`Render worker answered HTTP ${response.status}.`);
      const result = await withAbort(response.json(), lifetime.signal);
      if (result.challenged) throw Error('The page showed a bot challenge to the renderer.');
      if (!Number.isFinite(result.words) || !Number.isFinite(result.extraWords)) throw Error('The render worker sent no word count.');
      return { words: result.words, extraWords: result.extraWords };
    } finally { lifetime.dispose(); }
  };
}
