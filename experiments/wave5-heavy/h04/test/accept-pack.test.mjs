import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { loadAcceptCases } from "../accept-pack/src/load-cases.mjs";
import { H04_ROOT } from "../src/paths.mjs";
import { COMPOSITION_SHA } from "../src/m01.mjs";

test("accept-pack preserves seven public lockfile cases", () => {
  const { cases } = loadAcceptCases();
  const pub = cases.filter((c) => c.pack === "lockfile-public");
  assert.equal(pub.length, 7, pub.map((c) => c.id).join(","));
});

test("delivery-negative: missing promised output fails delivery", () => {
  const bin = join(H04_ROOT, "accept-pack/bin/accept.mjs");
  const r = spawnSync(process.execPath, [bin, "delivery-negative"], {
    cwd: H04_ROOT,
    encoding: "utf8",
    timeout: 60_000,
  });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const result = JSON.parse(r.stdout);
  assert.equal(result.ok, true);
  assert.equal(result.compositionSha, COMPOSITION_SHA);
  assert.equal(result.after.kind, "incomplete-delivery");
  assert.equal(result.after.pass, false);
  assert.equal(result.simulated.deliveryMustFail, true);
  const saved = join(H04_ROOT, "accept-pack/runs/delivery-negative/result.json");
  assert.equal(existsSync(saved), true);
  const disk = JSON.parse(readFileSync(saved, "utf8"));
  assert.equal(disk.ok, true);
});
