// Disposable loopback host for restart and shutdown tests. No live grants.
import { createServer } from "node:http";
import { createSdsApp } from "../../app.js";

const crash = process.env.NEOMORPHIC_OPPORTUNITY_CRASH_AFTER_COMMIT === "1";
const app = createSdsApp({
  neomorphicOpportunity: {
    env: process.env,
    afterDurableWrite: crash
      ? ({ kind }) => {
          if (kind === "commit") process.exit(86);
        }
      : undefined,
  },
});
const handle = app.get("neoOpportunity");
if (!handle) {
  process.send?.({ error: "not_mounted" });
  process.exit(1);
}
await handle.ready();
if (handle.state.status !== "ready") {
  process.send?.({ error: handle.state.reason || "unavailable" });
  process.exit(1);
}
const server = createServer(app);
server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  process.send?.({ port: address && typeof address === "object" ? address.port : 0 });
});
async function stop(code) {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
  await handle.close();
  process.exit(code);
}
process.on("SIGTERM", () => {
  void stop(0);
});
