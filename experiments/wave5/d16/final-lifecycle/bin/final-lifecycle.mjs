#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { INTEGRATION_OWNER, PINNED_IMPLEMENTATION, SCHEMA } from "../lib/contract.mjs";
import { requirePinnedTree } from "../lib/kit.mjs";
import { killIsolate } from "../lib/process.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const owned = join(here, "..");
const argv = process.argv.slice(2);
const cmd = argv[0] || "test";

function print(obj) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
}

try {
  const pinned = requirePinnedTree();
  if (cmd === "pins") {
    print({ ok: true, schema: SCHEMA, pinned: PINNED_IMPLEMENTATION, resolved: pinned, owner: INTEGRATION_OWNER });
    process.exit(0);
  }
  if (cmd === "test" || cmd === "run") {
    const r = spawnSync(
      process.execPath,
      ["--test", "--test-concurrency=1", "--test-timeout=120000", "test/isolated-cli.test.mjs", "test/stale-partial.test.mjs", "test/timeout-orphan.test.mjs", "test/http-untrusted.test.mjs"],
      { cwd: owned, encoding: "utf8", timeout: 120_000, maxBuffer: 8 * 1024 * 1024 },
    );
    const leftover = killIsolate("w5-d16-final-");
    print({
      ok: r.status === 0,
      schema: SCHEMA,
      owner: INTEGRATION_OWNER,
      pinned: PINNED_IMPLEMENTATION,
      resolved: pinned,
      testStatus: r.status,
      stdoutTail: String(r.stdout || "").slice(-2500),
      stderrTail: String(r.stderr || "").slice(-1500),
      leftoverKilled: leftover,
    });
    process.exit(r.status == null ? 1 : r.status);
  }
  print({ ok: false, schema: SCHEMA, error: `unknown command ${cmd}` });
  process.exit(2);
} catch (err) {
  killIsolate("w5-d16-final-");
  print({ ok: false, schema: SCHEMA, error: String(err?.message || err) });
  process.exit(2);
}
