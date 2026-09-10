// Executable entrypoint for direct Node and managed-host module loaders.
// Import server/app.js when a caller needs an unbound application factory.
import { createSdsApp } from "./app.js";

const app = createSdsApp();
const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`[samedaydesk] listening on :${port}  (${process.env.NODE_ENV === "production" ? "production" : "development"})`);
});
