// Arms one timeout for the next opted-in due task. No interval and no timer
// when the store has no scheduled customer task.
export function armScheduler(service, { onError = () => {} } = {}) {
  let timer = null;
  let stopped = false;

  async function plan() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (stopped) return;
    const next = await service.nextDueAt();
    if (next == null) return;
    const delay = Math.max(0, next - Date.now());
    timer = setTimeout(() => {
      timer = null;
      service.runDue()
        .catch((error) => onError(error))
        .finally(() => { if (!stopped) plan().catch((error) => onError(error)); });
    }, delay);
    if (typeof timer.unref === "function") timer.unref();
  }

  return {
    plan,
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
    get armed() { return timer != null; },
  };
}
