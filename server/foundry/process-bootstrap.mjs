import { installVerifiedPgTls } from "./pg-tls.js";

installVerifiedPgTls();
if (process.env.FOUNDRY_EXECUTION_RUNTIME === "wasmtime49-embed") {
  await import("./wasmtime49-embed/register.mjs");
}
