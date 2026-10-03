/** SPDX-License-Identifier: MIT */
import { commandBudget } from '../vendor/ein-activation-continuation/src/deadline.mjs';

export function fail(code) {
  return Object.assign(new Error(code), { code });
}

export function scopeFor(env, { signal, stdin } = {}) {
  const ms = Number(env.SDS_ACTIVATION_DEADLINE_MS ?? 15000);
  const bytes = Number(env.SDS_ACTIVATION_MAX_RESPONSE_BYTES ?? 1048576);
  if (!Number.isSafeInteger(ms) || ms < 50 || ms > 60000
      || !Number.isSafeInteger(bytes) || bytes < 1 || bytes > 4194304) throw fail('invalid_budget');
  const deadline = performance.now() + ms;
  const budget = commandBudget({ EIN_CONTINUATION_DEADLINE_MS: String(ms) });
  const combined = signal ? AbortSignal.any([signal, budget.signal]) : budget.signal;
  let used = 0;
  const check = () => {
    if (signal?.aborted) throw fail('cancelled');
    if (combined.aborted || performance.now() >= deadline) throw fail('deadline_exceeded');
  };
  const run = async (work) => {
    check();
    let abort;
    const cancelled = new Promise((_, reject) => {
      abort = () => { stdin?.destroy?.(); reject(fail('cancelled')); };
      signal?.addEventListener('abort', abort, { once: true });
    });
    try {
      const result = await budget.run(() => Promise.race([Promise.resolve().then(work), cancelled]), { stdin });
      check();
      return result;
    } catch (error) {
      if (signal?.aborted) throw fail('cancelled');
      if (used > bytes) throw fail('body_limit');
      throw error;
    } finally {
      signal?.removeEventListener('abort', abort);
    }
  };
  const count = (size) => {
    used += size;
    if (used > bytes) throw fail('body_limit');
  };
  return {
    run, check, signal: combined, maxBytes: bytes,
    remaining() { check(); return Math.max(1, Math.floor(deadline - performance.now())); },
    stats() { return { responseBytes: used, maxResponseBytes: bytes, deadlineMs: ms, scope: 'stdin_readiness_discovery_status' }; },
    fetch(fetchImpl) {
      return async (url, init = {}) => {
        check();
        const response = await run(() => fetchImpl(url, {
          ...init, signal: init.signal ? AbortSignal.any([init.signal, combined]) : combined,
        }));
        let activeReader;
        return {
          status: response.status, headers: response.headers, url: response.url,
          redirected: response.redirected, type: response.type,
          body: response.body?.getReader ? {
            cancel: () => activeReader ? activeReader.cancel() : response.body.cancel(),
            getReader() {
              activeReader = response.body.getReader();
              return {
                async read() {
                  const step = await run(() => activeReader.read());
                  try { if (!step.done) count(step.value.byteLength); }
                  catch (error) { await activeReader.cancel().catch(() => {}); throw error; }
                  return step;
                },
                cancel: () => activeReader.cancel(),
                releaseLock: () => activeReader.releaseLock(),
              };
            },
          } : null,
          async text() { const text = await run(() => response.text()); count(Buffer.byteLength(text)); return text; },
        };
      };
    },
  };
}
