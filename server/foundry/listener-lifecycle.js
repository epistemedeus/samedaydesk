export function bindListenerLifecycle(server, closeResources, options = {}) {
  const forceMs = options.forceMs ?? 4000;
  const drainMs = options.drainMs ?? 400;
  const exit = options.exit || ((code) => process.exit(code));
  let shuttingDown = false;
  async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    const force = setTimeout(() => exit(1), forceMs);
    if (typeof force.unref === "function") force.unref();
    await new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const drain = setTimeout(() => {
        server.closeAllConnections?.();
        done();
      }, drainMs);
      server.close(() => {
        clearTimeout(drain);
        done();
      });
    });
    try {
      await closeResources?.();
    } catch (error) {
      console.error("sds_shutdown_close_failed", {
        name: error instanceof Error ? error.name : "unknown",
      });
    }
    clearTimeout(force);
    exit(0);
  }
  if (options.bindSignals !== false) {
    process.once("SIGTERM", () => { void shutdown(); });
    process.once("SIGINT", () => { void shutdown(); });
  }
  return shutdown;
}
