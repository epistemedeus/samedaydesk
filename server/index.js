// Executable entrypoint for direct Node and managed-host module loaders.
// Import server/app.js when a caller needs an unbound application factory.
import { createSdsApp } from "./app.js";
import { bindListenerLifecycle } from "./foundry/listener-lifecycle.js";

const app = createSdsApp();
const port = process.env.PORT || 3000;
const server = app.listen(port, "0.0.0.0", () => {
  console.log(`[samedaydesk] listening on :${port}  (${process.env.NODE_ENV === "production" ? "production" : "development"})`);
});
bindListenerLifecycle(server, async () => {
  const handle = app.get("s51Correspondence");
  if (handle?.close) await handle.close();
});
