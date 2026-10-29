import { setMaxListeners } from "node:events";

// One owned deadline, optionally shortened by a caller's lifetime. Disposal
// cancels in-flight children and removes both the timer and parent listener.
export function createRequestBudget(totalMs, parentSignal) {
  const ctrl = new AbortController();
  const duration = Number.isFinite(totalMs) ? Math.max(0, totalMs) : 0;
  const deadline = Date.now() + duration;
  setMaxListeners(64, ctrl.signal); // bounded parallel title/DNS requests
  const onAbort = () => ctrl.abort(parentSignal.reason);
  const timer = duration > 0 ? setTimeout(() => ctrl.abort(), duration) : undefined;
  if (duration === 0) ctrl.abort();
  if (parentSignal?.aborted) onAbort();
  else parentSignal?.addEventListener("abort", onAbort, { once: true });
  return {
    totalMs: duration,
    signal: ctrl.signal,
    remaining: () => Math.max(0, deadline - Date.now()),
    get exhausted() { return ctrl.signal.aborted || Date.now() >= deadline; },
    dispose() {
      clearTimeout(timer);
      parentSignal?.removeEventListener("abort", onAbort);
      if (!ctrl.signal.aborted) ctrl.abort();
    },
  };
}

// Also bounds an injected resolver that ignores AbortSignal. The production
// resolver cancels its actual DNS queries, rather than merely losing a race.
export function withAbort(promise, signal) {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(signal.reason);
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(promise).then(
      (value) => { signal.removeEventListener("abort", onAbort); resolve(value); },
      (error) => { signal.removeEventListener("abort", onAbort); reject(error); },
    );
  });
}
