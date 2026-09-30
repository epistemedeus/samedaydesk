export function bindListenerLifecycle(server, closeResources, options = {}) {
  const forceMs = options.forceMs ?? 4000;
  const drainMs = options.drainMs ?? 400;
  const exit = options.exit || ((code) => process.exit(code));
  let shutdownPromise;
  async function drainAndClose() {
    let finished = false;
    let drain;
    const finish = (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(force);
      clearTimeout(drain);
      exit(code);
    };
    // The deadline covers both active HTTP work and resource cleanup.
    // Keep it referenced: an unresolved cleanup promise may hold no handles.
    const force = setTimeout(() => {
      try { server.closeAllConnections?.(); }
      finally { finish(1); }
    }, forceMs);
    try {
      await new Promise((resolve, reject) => {
        // Closing idle keep-alives must not truncate active requests.
        drain = setTimeout(() => server.closeIdleConnections?.(), drainMs);
        server.close((error) => {
          clearTimeout(drain);
          if (error) reject(error);
          else resolve();
        });
      });
      if (finished) return;
      await closeResources?.();
      finish(0);
    } catch (error) {
      console.error("sds_shutdown_close_failed", {
        name: error instanceof Error ? error.name : "unknown",
      });
      finish(1);
    }
  }
  function shutdown() {
    shutdownPromise ??= drainAndClose();
    return shutdownPromise;
  }
  if (options.bindSignals !== false) {
    process.once("SIGTERM", () => { void shutdown(); });
    process.once("SIGINT", () => { void shutdown(); });
  }
  return shutdown;
}
