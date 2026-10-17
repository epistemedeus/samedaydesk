// Executable entrypoint for direct Node and managed-host module loaders.
// Import server/app.js when a caller needs an unbound application factory.
import { createSdsApp } from "./app.js";
import { bindListenerLifecycle } from "./foundry/listener-lifecycle.js";

const app = createSdsApp();
const port = process.env.PORT || 3000;
const server = app.listen(port, "0.0.0.0", () => {
  console.log(`[samedaydesk] listening on :${port}  (${process.env.NODE_ENV === "production" ? "production" : "development"})`);
});
// Observe this existing listener after the provider's native listen hook. No
// additional listener, proxy trust or provider authority is created here.
app.get("neoContributorJourney")?.bindListener?.(server);
if (process.env.MANAGED_WATCH_SCHEDULER === "1") {
  app.get("l12ManagedWatch")?.arm?.().catch((error) => {
    console.error("managed_watch_scheduler_refused", error?.code || "error");
  });
}
if (process.env.MONITOR_SCHEDULER === "1") {
  app.get("machineServices")?.arm?.().catch(() => {
    console.error("monitor_scheduler_unavailable");
  });
}
const shutdown = bindListenerLifecycle(server, async () => {
  const handle = app.get("s51Correspondence");
  try {
    try { await app.get("machineServices")?.close?.(); }
    finally { await app.get("s346HostedUsefulJourney")?.close(); }
  } finally {
    try {
      await app.get("l12ManagedWatch")?.close?.();
    } finally {
      try {
        await app.get("neoOpportunity")?.close?.();
      } finally {
        try { await app.get("hostedWalletMarket")?.close?.(); await app.get("neoContributorJourney")?.close?.(); }
        finally { if (handle?.close) await handle.close(); }
      }
    }
  }
});
// The audited native loader emits exit on controller stdin EOF. Reuse the same
// existing drain/resource closure used by SIGTERM, rather than exiting around it.
app.get("neoContributorJourney")?.bindLifecycle?.(shutdown);
