// Executable entrypoint for direct Node and managed-host module loaders.
// Import server/app.js when a caller needs an unbound application factory.
import { createSdsApp } from "./app.js";
import { bindListenerLifecycle } from "./foundry/listener-lifecycle.js";

const app = createSdsApp();
const port = process.env.PORT || 3000;
const server = app.listen(port, "0.0.0.0", () => {
  console.log(`[samedaydesk] listening on :${port}  (${process.env.NODE_ENV === "production" ? "production" : "development"})`);
});
if (process.env.MANAGED_WATCH_SCHEDULER === "1") {
  app.get("l12ManagedWatch")?.arm?.().catch((error) => {
    console.error("managed_watch_scheduler_refused", error?.code || "error");
  });
}
bindListenerLifecycle(server, async () => {
  const handle = app.get("s51Correspondence");
  try {
    await app.get("s346HostedUsefulJourney")?.close();
  } finally {
    try {
      await app.get("l12ManagedWatch")?.close?.();
    } finally {
      if (handle?.close) await handle.close();
    }
  }
});
