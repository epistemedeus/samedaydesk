#!/usr/bin/env node
// Compatibility entry for the explicit installer. Does not run on import.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

if (process.argv[2] !== "--apply") {
  console.error("explicit --apply required; the listener and worker do not migrate");
  process.exit(1);
}

const install = fileURLToPath(new URL("./install.mjs", import.meta.url));
const child = spawn(process.execPath, [install, "--migrate"], {
  env: process.env,
  stdio: "inherit",
});
const [code] = await once(child, "exit");
process.exit(code ?? 1);
