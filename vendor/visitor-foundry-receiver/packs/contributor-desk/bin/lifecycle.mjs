#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const self = fileURLToPath(import.meta.url);
const tsx = fileURLToPath(new URL("../../terms-lifecycle/node_modules/tsx/dist/esm/index.mjs", import.meta.url));

if (process.env.NEO_LIFECYCLE_LOADED !== "1") {
  if (!existsSync(tsx)) {
    process.stderr.write(
      `${JSON.stringify({
        ok: false,
        code: "missing_dependency",
        message: "tsx is not installed. Run npm ci --prefix packs/terms-lifecycle. No receipt was written.",
        paymentAuthority: false,
      })}\n`,
    );
    process.exit(2);
  }
  const child = spawnSync(process.execPath, ["--import", tsx, self, ...process.argv.slice(2)], {
    stdio: "inherit",
    env: { ...process.env, NEO_LIFECYCLE_LOADED: "1", NODE_NO_WARNINGS: "1" },
  });
  process.exit(child.status === null ? 1 : child.status);
}

const { runLifecycleCli } = await import("../src/lifecycle-caller.mjs");
process.exit(await runLifecycleCli(process.argv));
