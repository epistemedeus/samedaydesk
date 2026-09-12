import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { verifyComplete } from "../../../tools/job-output-atomicity/index.mjs";
import { defaultFileStore, runCreateOrder } from "../../../tools/managed-useful-jobs-order/lib/create-order.mjs";
import { EXECUTION_CONTRACT_VERSION } from "../lib/contract.mjs";
import {
  FIRST_OFFER,
  loadDeliveryCatalog,
} from "../lib/delivery-catalog.mjs";
import {
  deliverSuppliedInput,
  orderRequestFromPreflight,
  runPreflightStage,
} from "../lib/delivery-kit.mjs";
import { sha256File } from "../lib/digest.mjs";
import { getJob } from "../lib/jobs.mjs";
import { REPO_ROOT } from "../lib/pins.mjs";
import { createExecutor, runPaidOffer } from "../lib/wrapper.mjs";
import { runEngineForD01 } from "../../../experiments/wave5/m01/lib/d01-adapter.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const deliverCli = join(here, "../bin/deliver.mjs");
const LOCK = join(REPO_ROOT, "tools/lockfile-pin-delta/fixtures");
const SCHEMA = join(REPO_ROOT, "tools/json-schema-webhook-drift/fixtures");
const ROUTE = join(REPO_ROOT, "tools/route-table-diff/fixtures");
const PAGE = join(REPO_ROOT, "tools/page-change-offline-job/fixtures");

function workDir(label) {
  return mkdtempSync(join(tmpdir(), `puj-m01-${label}-`));
}

function copyFile(src, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  return dest;
}

function lockInputs(work, { same = false } = {}) {
  const before = copyFile(join(LOCK, "journey/before.json"), join(work, "before.json"));
  const after = copyFile(
    join(LOCK, same ? "journey/before.json" : "journey/after.json"),
    join(work, "after.json"),
  );
  return { before, after };
}

describe("M01 engines on the D01 delivery kit", { timeout: 240_000 }, () => {
  it("published getJob selects lockfile with m01; default runPaidOffer runs it", async () => {
    const published = getJob("lockfile-pin-delta");
    assert.equal(published.id, "lockfile-pin-delta");
    assert.equal(published.m01, true);

    const work = workDir("default-lock");
    const inputs = lockInputs(work);
    const result = await runPaidOffer({
      jobId: FIRST_OFFER,
      inputs,
    });
    assert.equal(result.ok, true, result.error);
    assert.equal(result.jobId, "lockfile-pin-delta");
    assert.equal(result.sold, false);
    assert.equal(result.contract, EXECUTION_CONTRACT_VERSION);
    assert.equal(result.delivery.complete, true);
    assert.equal(existsSync(join(result.runOutDir, "pin-delta.json")), true);
    assert.equal(existsSync(join(result.runOutDir, "receipt.json")), true);
    assert.equal(result.receipt.runOutDir, result.runOutDir);
  });

  it("CLI deliver lockfile from a workdir that is not the checkout", () => {
    const work = workDir("cli-lock");
    const inputs = lockInputs(work);
    const r = spawnSync(
      process.execPath,
      [deliverCli, "--job", "lockfile-pin-delta", "--before", inputs.before, "--after", inputs.after],
      { encoding: "utf8", cwd: work, timeout: 180_000, maxBuffer: 8 * 1024 * 1024 },
    );
    assert.equal(r.status, 0, r.stderr + r.stdout.slice(0, 2000));
    const body = JSON.parse(r.stdout);
    assert.equal(body.ok, true, JSON.stringify({ stage: body.stage, code: body.order?.code || body.preflight?.code }));
    assert.equal(body.contract, EXECUTION_CONTRACT_VERSION);
    assert.equal(body.completeness.ok, true);
    assert.equal(body.mailbox.pickup.ok, true);
    assert.equal(body.mailbox.ack.deliveredToBuyer, true);
    assert.equal(existsSync(join(body.runOutDir, "pin-delta.json")), true);
    assert.notEqual(work, REPO_ROOT);
  });

  it("fresh caller can select all four engines without test injection", async () => {
    const catalog = loadDeliveryCatalog();
    assert.equal(catalog.firstOffer, "lockfile-pin-delta");

    const lockWork = workDir("four-lock");
    const lock = await deliverSuppliedInput({
      jobId: "lockfile-pin-delta",
      inputs: lockInputs(lockWork),
    });
    assert.equal(lock.ok, true, lock.order?.error || lock.preflight?.error);
    assert.equal(lock.order.wrapper.analysis.outcome, "actionable");

    const schemaWork = workDir("four-schema");
    const schema = await deliverSuppliedInput({
      jobId: "json-schema-webhook-drift",
      inputs: {
        before: copyFile(join(SCHEMA, "journey/before.json"), join(schemaWork, "before.json")),
        after: copyFile(join(SCHEMA, "journey/after.json"), join(schemaWork, "after.json")),
        used: copyFile(join(SCHEMA, "journey/used.json"), join(schemaWork, "used.json")),
      },
    });
    assert.equal(schema.ok, true, schema.order?.error || schema.preflight?.error);
    assert.equal(existsSync(join(schema.runOutDir, "drift-brief.json")), true);

    const routeWork = workDir("four-route");
    const route = await deliverSuppliedInput({
      jobId: "route-table-diff",
      inputs: {
        before: copyFile(join(ROUTE, "journey/before.json"), join(routeWork, "before.json")),
        after: copyFile(join(ROUTE, "journey/after.json"), join(routeWork, "after.json")),
      },
    });
    assert.equal(route.ok, true, route.order?.error || route.preflight?.error);
    assert.equal(existsSync(join(route.runOutDir, "route-diff.json")), true);

    const pageWork = workDir("four-page");
    copyFile(join(PAGE, "customer-job/before.json"), join(pageWork, "before.json"));
    copyFile(join(PAGE, "customer-job/after.json"), join(pageWork, "after.json"));
    const page = await deliverSuppliedInput({
      jobId: "page-change-offline-job",
      inputs: {
        job: copyFile(join(PAGE, "customer-job/job.json"), join(pageWork, "job.json")),
      },
    });
    assert.equal(page.ok, true, page.order?.error || page.preflight?.error);
    assert.equal(existsSync(join(page.runOutDir, "page-change.json")), true);
  });

  it("same lockfile bytes are useful no-change; changed lockfile is actionable", async () => {
    const sameWork = workDir("same");
    const same = await deliverSuppliedInput({
      jobId: "lockfile-pin-delta",
      inputs: lockInputs(sameWork, { same: true }),
    });
    assert.equal(same.ok, true, same.order?.error);
    assert.equal(same.order.wrapper.analysis.outcome, "informational");
    assert.equal(same.order.wrapper.delivery.complete, true);

    const changedWork = workDir("changed");
    const changed = await deliverSuppliedInput({
      jobId: "lockfile-pin-delta",
      inputs: lockInputs(changedWork),
    });
    assert.equal(changed.ok, true, changed.order?.error);
    assert.equal(changed.order.wrapper.analysis.outcome, "actionable");
    assert.notEqual(same.runOutDir, changed.runOutDir);
  });

  it("HTML lockfile is an unsupported-format refuse, not unknown-job", async () => {
    const work = workDir("html");
    const delivered = await deliverSuppliedInput({
      jobId: "lockfile-pin-delta",
      inputs: {
        before: copyFile(join(LOCK, "html/not-a-lock.html"), join(work, "before.html")),
        after: copyFile(join(LOCK, "journey/after.json"), join(work, "after.json")),
      },
    });
    assert.equal(delivered.ok, false);
    assert.equal(delivered.stage, "order");
    assert.equal(delivered.order.code, "html-input");
    assert.equal(delivered.sold, false);
  });

  it("malformed JSON is refused at preflight", async () => {
    const work = workDir("malformed");
    const bad = join(work, "before.json");
    writeFileSync(bad, "{ this is not json");
    const delivered = await deliverSuppliedInput({
      jobId: "lockfile-pin-delta",
      inputs: {
        before: bad,
        after: copyFile(join(LOCK, "journey/after.json"), join(work, "after.json")),
      },
    });
    assert.equal(delivered.ok, false);
    assert.equal(delivered.stage, "preflight");
    assert.ok(
      ["input-malformed", "input-malformed-json"].includes(delivered.preflight.code),
      delivered.preflight?.code,
    );
  });

  it("1MiB+1 is input-oversize at preflight", async () => {
    const work = workDir("oversize");
    const big = join(work, "after.json");
    writeFileSync(big, Buffer.alloc(1_048_576 + 1, 0x61));
    const delivered = await deliverSuppliedInput({
      jobId: "lockfile-pin-delta",
      inputs: {
        before: copyFile(join(LOCK, "journey/before.json"), join(work, "before.json")),
        after: big,
      },
    });
    assert.equal(delivered.ok, false);
    assert.equal(delivered.stage, "preflight");
    assert.equal(delivered.preflight.code, "input-oversize");
  });

  it("OpenAPI bytes are the wrong artifact for json-schema-webhook-drift", async () => {
    const work = workDir("openapi");
    const delivered = await deliverSuppliedInput({
      jobId: "json-schema-webhook-drift",
      inputs: {
        before: copyFile(join(SCHEMA, "openapi-refuse/before.json"), join(work, "before.json")),
        after: copyFile(join(SCHEMA, "openapi-refuse/after.json"), join(work, "after.json")),
        used: copyFile(join(SCHEMA, "openapi-refuse/used.json"), join(work, "used.json")),
      },
    });
    assert.equal(delivered.ok, false);
    assert.equal(delivered.stage, "order");
    assert.equal(delivered.order.code, "not-this-job-openapi");
    assert.equal(delivered.sold, false);
  });

  it("input bytes freeze once; later caller mutation is not consumed", async () => {
    const work = workDir("freeze");
    const inputs = lockInputs(work);
    const original = readFileSync(inputs.before);
    let seen = null;
    const execute = createExecutor({
      runEngine(jobId, opts) {
        seen = readFileSync(opts.files.before);
        writeFileSync(inputs.before, '{"mutated":true}\n');
        return runEngineForD01(jobId, opts);
      },
    });
    const result = await execute({
      jobId: "lockfile-pin-delta",
      inputs,
    });
    assert.equal(result.ok, true, result.error);
    assert.deepEqual(seen, original);
    assert.equal(JSON.parse(readFileSync(inputs.before, "utf8")).mutated, true);
  });

  it("runOutDir remains receipt identity after stale publishedDir substitution", async () => {
    const work = workDir("stale");
    const published = mkdtempSync(join(tmpdir(), "puj-m01-pub-"));
    const result = await deliverSuppliedInput({
      jobId: "lockfile-pin-delta",
      inputs: lockInputs(work),
      publishedDir: published,
    });
    assert.equal(result.ok, true, result.order?.error);
    const jsonName = "pin-delta.json";
    const isolated = join(result.runOutDir, jsonName);
    const publishedJson = join(published, jsonName);
    const isolatedSha = sha256File(isolated);
    writeFileSync(publishedJson, '{"stale":true}\n');
    assert.notEqual(sha256File(publishedJson), isolatedSha);
    const listed = result.order.outputs.find((o) => o.name === jsonName);
    assert.equal(listed.sha256, isolatedSha);
    const catalog = loadDeliveryCatalog();
    const pin = catalog.jobs.find((j) => j.id === "lockfile-pin-delta").enginePin;
    const again = verifyComplete({
      root: result.runOutDir,
      catalog,
      expectedArchiveSha256: pin.sha256,
      expectedArchiveBytes: pin.bytes,
      evidenceClass: "local-runtime",
    });
    assert.equal(again.ok, true, JSON.stringify(again));
    const publishedVerify = verifyComplete({
      root: published,
      catalog,
      expectedArchiveSha256: pin.sha256,
      expectedArchiveBytes: pin.bytes,
      evidenceClass: "local-runtime",
    });
    assert.equal(publishedVerify.ok, false);
  });

  it("idempotent replay and swapped-file conflict reuse the order kernel", async () => {
    const work = workDir("replay");
    const inputs = lockInputs(work);
    const catalog = loadDeliveryCatalog();
    const pre = await runPreflightStage({
      jobId: "lockfile-pin-delta",
      inputs,
      catalog,
    });
    assert.equal(pre.ok, true, pre.error);
    const store = defaultFileStore(mkdtempSync(join(tmpdir(), "puj-m01-store-")));
    const raw = orderRequestFromPreflight(pre, {
      orderId: "ord-lock-replay",
      catalog,
    });
    const first = await runCreateOrder(raw, {
      store,
      catalog,
      outDir: mkdtempSync(join(tmpdir(), "puj-m01-ord-a-")),
    });
    assert.equal(first.ok, true, JSON.stringify(first));
    const replay = await runCreateOrder(raw, {
      store,
      catalog,
      outDir: mkdtempSync(join(tmpdir(), "puj-m01-ord-b-")),
    });
    assert.equal(replay.ok, true);
    assert.equal(replay.replayed, true);
    assert.equal(replay.orderId, first.orderId);
    assert.equal(replay.termsHash, first.termsHash);

    const swappedWork = workDir("conflict");
    const swapped = {
      before: copyFile(join(LOCK, "journey/before.json"), join(swappedWork, "before.json")),
      after: copyFile(join(LOCK, "journey/before.json"), join(swappedWork, "after.json")),
    };
    const preB = await runPreflightStage({
      jobId: "lockfile-pin-delta",
      inputs: swapped,
      catalog,
    });
    const conflict = await runCreateOrder(
      orderRequestFromPreflight(preB, { orderId: "ord-lock-replay", catalog }),
      { store, catalog, outDir: mkdtempSync(join(tmpdir(), "puj-m01-ord-c-")) },
    );
    assert.equal(conflict.ok, false);
    assert.equal(conflict.code, "f-order");
    await store.close?.();
  });

  it("missing pin-delta.md in runOutDir is not complete", async () => {
    const work = workDir("missing-md");
    const result = await deliverSuppliedInput({
      jobId: "lockfile-pin-delta",
      inputs: lockInputs(work),
    });
    assert.equal(result.ok, true, result.order?.error);
    unlinkSync(join(result.runOutDir, "pin-delta.md"));
    const catalog = loadDeliveryCatalog();
    const pin = catalog.jobs.find((j) => j.id === "lockfile-pin-delta").enginePin;
    const again = verifyComplete({
      root: result.runOutDir,
      catalog,
      expectedArchiveSha256: pin.sha256,
      expectedArchiveBytes: pin.bytes,
      evidenceClass: "local-runtime",
    });
    assert.equal(again.ok, false);
    assert.equal(again.code, "missing-output");
  });

  it("vendor-budget-impact remains a useful published job on the same kit", async () => {
    const work = workDir("budget");
    const result = await deliverSuppliedInput({
      jobId: "vendor-budget-impact",
      inputs: {
        before: copyFile(
          join(REPO_ROOT, "server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/before.json"),
          join(work, "before.json"),
        ),
        after: copyFile(
          join(REPO_ROOT, "server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/after.json"),
          join(work, "after.json"),
        ),
      },
    });
    assert.equal(result.ok, true, result.order?.error);
    assert.equal(existsSync(join(result.runOutDir, "budget-impact.json")), true);
  });
});
