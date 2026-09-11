import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";
import { D01_INJECTION, runCatalogPaidOffer, runEngineForD01 } from "../lib/d01-adapter.mjs";
import { ensureD01Root, importD01 } from "../lib/d01-root.mjs";
import { MODULE_ROOT } from "../lib/paths.mjs";
import { pinFixture, tmpOut } from "./helpers.mjs";

test("unpatched D01 createExecutor cannot select lockfile-pin-delta", async () => {
  const located = ensureD01Root();
  const d01 = await importD01(located.root);
  assert.equal(d01.contract.EXECUTION_CONTRACT_VERSION, "samedaydesk.paid-useful-jobs.execution.v1");
  let unknown;
  try {
    d01.jobs.getJob("lockfile-pin-delta");
    unknown = false;
  } catch (err) {
    unknown = err.code === "unknown-job";
  }
  assert.equal(unknown, true);

  const execute = d01.wrapper.createExecutor({
    acquireKit: () => MODULE_ROOT,
    runEngine: runEngineForD01,
  });
  const result = await execute({
    jobId: "lockfile-pin-delta",
    inputs: {
      before: pinFixture("lockfile-pin-delta", "journey/before.json"),
      after: pinFixture("lockfile-pin-delta", "journey/after.json"),
    },
    outDir: tmpOut("d01-unknown"),
  });
  assert.equal(result.ok, false);
  assert.equal(result.sold, false);
  assert.equal(result.code, "unknown-job");
  assert.equal(D01_INJECTION.files.includes("server/paid-useful-jobs/lib/wrapper.mjs"), true);
});

test("adapter maps lockfile journey through D01 classify helpers", async () => {
  const located = ensureD01Root();
  const d01 = await importD01(located.root);
  const outDir = tmpOut("d01-lock");
  const result = await runCatalogPaidOffer(
    {
      jobId: "lockfile-pin-delta",
      inputs: {
        before: pinFixture("lockfile-pin-delta", "journey/before.json"),
        after: pinFixture("lockfile-pin-delta", "journey/after.json"),
      },
      outDir,
    },
    d01.contract,
  );
  assert.equal(result.sold, false);
  assert.equal(result.purchaseAuthority, false);
  assert.equal(result.transport, "ok");
  assert.equal(result.analysis.outcome, "actionable");
  assert.equal(result.ok, true);
  assert.equal(result.delivery.complete, true);
});

test("adapter preserves HTML lockfile refusal instead of calling it a crash", async () => {
  const located = ensureD01Root();
  const d01 = await importD01(located.root);
  const result = await runCatalogPaidOffer(
    {
      jobId: "lockfile-pin-delta",
      inputs: {
        before: pinFixture("lockfile-pin-delta", "html/not-a-lock.html"),
        after: pinFixture("lockfile-pin-delta", "journey/after.json"),
      },
      outDir: tmpOut("d01-html"),
    },
    d01.contract,
  );
  assert.equal(result.ok, false);
  assert.equal(result.sold, false);
  assert.equal(result.transport, "ok");
  assert.equal(result.analysis.outcome, "refused");
  assert.equal(result.code, "html-input");
});

test("run-job CLI writes catalog-receipt for the first offer", () => {
  const outDir = tmpOut("run-job");
  const spawned = spawnSync(
    process.execPath,
    [
      join(MODULE_ROOT, "bin/run-job.mjs"),
      "lockfile-pin-delta",
      "--before",
      pinFixture("lockfile-pin-delta", "journey/before.json"),
      "--after",
      pinFixture("lockfile-pin-delta", "journey/after.json"),
      "--out-dir",
      outDir,
    ],
    { encoding: "utf8" },
  );
  assert.equal(spawned.status, 0, spawned.stderr);
  const body = JSON.parse(spawned.stdout);
  assert.equal(body.engineId, "lockfile-pin-delta");
  assert.equal(body.engineSource, "in-tree");
  assert.equal(body.outcome.kind, "analysis");
});
