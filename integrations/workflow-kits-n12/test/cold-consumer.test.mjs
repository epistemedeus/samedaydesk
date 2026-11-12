import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { root } from "./helpers.mjs";

test("cold consumer: a fresh copy imports only the package entry and gets an accepted period", () => {
  const dir = mkdtempSync(join(tmpdir(), "sds-wk-n12-cold-"));
  try {
    const pkg = join(dir, "workflow-kits-n12");
    cpSync(root, pkg, { recursive: true, filter: (src) => !src.includes(`${join(root, "test")}`) });
    const script = `
      import { readFileSync } from "node:fs";
      import { createKitEffects, fromMakeExecution, fromN8nExecution, runPeriod } from "./workflow-kits-n12/index.mjs";
      const clock = "2026-11-12T10:30:00.000Z";
      const make = JSON.parse(readFileSync("./workflow-kits-n12/fixtures/make/execution-period-n.json", "utf8"));
      const n8n = JSON.parse(readFileSync("./workflow-kits-n12/fixtures/n8n/execution-period-n.json", "utf8"));
      const a = runPeriod(fromMakeExecution(make, { clock }), { effects: createKitEffects() }).period;
      const b = runPeriod(fromN8nExecution(n8n, { clock }), { effects: createKitEffects() }).period;
      process.stdout.write(JSON.stringify({ a: a.decision, b: b.decision, same: a.idempotencyKey === b.idempotencyKey }));
    `;
    const run = spawnSync(process.execPath, ["--input-type=module", "-e", script], { cwd: dir, encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(JSON.parse(run.stdout), { a: "accept", b: "accept", same: true });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
