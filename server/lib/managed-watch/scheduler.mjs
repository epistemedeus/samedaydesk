// One timeout for the next opted-in due task. No interval. No timer when the
// store has no scheduled customer task. Delay is capped at the platform timer
// limit so a long cadence cannot overflow into an immediate loop. A due instant
// that does not advance is armed at most once more, then left until a later
// persisted transition replans it.
export const MAX_TIMER_MS = 2_147_483_647;

export function boundedTimerDelay(nextMs, nowMs = Date.now()) {
  if (nextMs == null || !Number.isFinite(nextMs)) return null;
  const delay = nextMs - nowMs;
  if (delay <= 0) return 0;
  return Math.min(delay, MAX_TIMER_MS);
}

export function armScheduler(service, {
  onError = () => {},
  schedule = setTimeout,
  clear = clearTimeout,
  now = Date.now,
} = {}) {
  let timer = null;
  let stopped = false;
  let nextDueAt = null;
  let planning = null;
  let again = false;
  let skipImmediate = false;
  let repeatedDue = null;

  async function plan() {
    if (stopped) return;
    if (planning) {
      again = true;
      return planning;
    }
    planning = (async () => {
      try {
        do {
          again = false;
          await planOnce();
        } while (again && !stopped);
      } finally {
        planning = null;
      }
    })();
    return planning;
  }

  async function planOnce() {
    if (timer) {
      clear(timer);
      timer = null;
    }
    nextDueAt = null;
    if (stopped) return;
    const next = await service.nextDueAt();
    if (next == null || !Number.isFinite(next)) return;
    const delay = boundedTimerDelay(next, now());
    if (delay == null) return;
    if (delay === 0 && skipImmediate) {
      skipImmediate = false;
      return;
    }
    nextDueAt = next;
    timer = schedule(() => {
      timer = null;
      const dueNow = next <= now();
      const work = dueNow ? service.runDue() : Promise.resolve(null);
      work.then(async (outcome) => {
        if (!dueNow || !outcome || outcome.action === "completed" || outcome.read) {
          repeatedDue = null;
          return;
        }
        const follow = await service.nextDueAt();
        if (follow != null && follow <= now() && repeatedDue === follow) skipImmediate = true;
        else if (follow != null && follow <= now()) repeatedDue = follow;
        else repeatedDue = null;
      }).catch((error) => onError(error)).finally(() => {
        if (!stopped) plan().catch((error) => onError(error));
      });
    }, delay);
    if (timer && typeof timer.unref === "function") timer.unref();
  }

  return {
    plan,
    stop() {
      stopped = true;
      if (timer) clear(timer);
      timer = null;
      nextDueAt = null;
    },
    get armed() { return timer != null; },
    get nextDueAt() { return nextDueAt; },
  };
}
