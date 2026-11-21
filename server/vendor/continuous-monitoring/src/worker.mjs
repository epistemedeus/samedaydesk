import { boundedGet } from './http.mjs';
import { normalize, iso } from './observation.mjs';

// Invoked by an existing cron/timer. No daemon, model calls or process spawning.
export async function tick(store, { now = Date.now, limit = store.options.maxTick, afterStage, afterStart, signal } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('invalid_tick_limit');
  const recovered = await store.recover(now()), completed = [], visited = [];
  for (let index = 0; index < limit; index++) {
    if (signal?.aborted) break;
    const claim = await store.claim(now(), visited);
    if (!claim) break;
    visited.push(claim.monitorId);
    if (!await store.start(claim, now())) {
      await store.stage(claim, { normalized: null, failure: 'stopped_before_dispatch',
        metrics: { bytes: 0, requests: 0, durationMs: 0, unknown: false } }, now());
      const result = await store.finish(claim.id, now());
      if (result) completed.push(result);
      continue;
    }
    if (afterStart) await afterStart(claim);
    const controller = new AbortController();
    let checking = true, cancellation;
    const check = async () => {
      try { if (!await store.stillActive(claim, now())) controller.abort(); }
      catch { controller.abort(); }
      if (checking && !controller.signal.aborted) cancellation = setTimeout(check, 100);
    };
    cancellation = setTimeout(check, 100);
    const baseline = await store.baseline(claim.monitorId), headers = {};
    const validators = baseline?.nonSemantic?.validators;
    if (validators?.etag) headers['if-none-match'] = validators.etag;
    else if (validators?.lastModified) headers['if-modified-since'] = validators.lastModified;
    let response;
    try {
      response = await boundedGet(claim.config.url, {
        mountedOrigin: store.options.mountedOrigin, headers,
        signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
        timeoutMs: Math.max(1, Math.min(claim.config.budget.timeoutMs, claim.expiresAt - now())),
        maxBytes: claim.config.budget.maxBodyBytes,
        authorize: () => store.stillActive(claim, now()),
      });
    } finally { checking = false; clearTimeout(cancellation); }
    let normalized;
    if (response.status === 304 && !response.failure && baseline && Object.keys(headers).length) {
      normalized = { ...baseline, observedAt: iso(now()) };
    } else {
      normalized = normalize(claim.config, response, now());
      normalized.nonSemantic = { ...normalized.nonSemantic, validators: {
        etag: response.headers.etag ?? null, lastModified: response.headers['last-modified'] ?? null,
      } };
    }
    const staged = { normalized, failure: response.failure, metrics: {
      bytes: response.bytes, requests: response.requests, durationMs: response.durationMs, unknown: false,
    } };
    if (await store.stage(claim, staged, now())) {
      if (afterStage) await afterStage(claim);
      const result = await store.finish(claim.id, now());
      if (result) completed.push(result);
    }
  }
  await store.prune(now());
  return { recovered, completed };
}
