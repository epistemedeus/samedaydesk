import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { deliverDisjointSecondJob, deliverSuppliedInput, runPreflightStage } from "../lib/delivery-kit.mjs";
import { EXECUTION_CONTRACT_VERSION } from "../lib/contract.mjs";
import { verifyComplete } from "../../../tools/job-output-atomicity/index.mjs";
import { CATALOG_PATH } from "../../../tools/job-output-atomicity/lib/pins.mjs";
import { runCreateOrder, defaultFileStore } from "../../../tools/managed-useful-jobs-order/lib/create-order.mjs";
import { loadOrder, ORDERS } from "../../../tools/managed-useful-jobs-order/test/helpers.mjs";
import { writePaddedPricingJson } from "../../../tools/job-input-preflight/test/helpers.mjs";
import { seedVendorFromD01 } from "../../../tools/result-mailbox/test/helpers.mjs";
import { REPO_ROOT } from "../lib/pins.mjs";
import { sha256File } from "../lib/digest.mjs";
import { callerBudget } from "./helpers.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const deliverCli = join(here, "../bin/deliver.mjs");
const before = join(here, "../fixtures/caller/vendor-budget-impact/before.json");
const after = join(here, "../fixtures/caller/vendor-budget-impact/after.json");

function mutateAfter(dir) {
  const src = JSON.parse(readFileSync(after, "utf8"));
  src.rows = src.rows.map((row) =>
    row.field === "desk-chat-output" ? { ...row, value: 99 } : row,
  );
  const path = join(dir, "after-b.json");
  writeFileSync(path, `${JSON.stringify(src, null, 2)}\n`);
  return path;
}

describe("supplied-input delivery composition", { timeout: 240_000 }, () => {
  it("CLI journey: preflight→order→execute→completeness→mailbox plus disjoint second job", async () => {
    const work = mkdtempSync(join(tmpdir(), "puj-deliv-cli-"));
    const secondAfter = mutateAfter(work);
    const r = spawnSync(
      process.execPath,
      [
        deliverCli,
        "--job",
        "vendor-budget-impact",
        "--before",
        before,
        "--after",
        after,
        "--second-after",
        secondAfter,
      ],
      { encoding: "utf8", cwd: REPO_ROOT, timeout: 180_000, maxBuffer: 8 * 1024 * 1024 },
    );
    assert.equal(r.status, 0, r.stderr + r.stdout.slice(0, 2000));
    const body = JSON.parse(r.stdout);
    assert.equal(body.ok, true, JSON.stringify({ first: body.first?.ok, second: body.second?.ok, disjoint: body.disjoint }));
    assert.equal(body.disjoint, true);
    assert.equal(body.first.contract, EXECUTION_CONTRACT_VERSION);
    assert.equal(body.first.completeness.ok, true);
    assert.equal(body.first.mailbox.pickup.ok, true);
    assert.equal(body.first.mailbox.ack.deliveredToBuyer, true);
    assert.equal(body.second.ok, true);
    assert.notEqual(body.first.runOutDir, body.second.runOutDir);
    assert.notEqual(body.first.mailbox.requestId, body.second.mailbox.requestId);
    assert.notEqual(body.first.order.orderId, body.second.order.orderId);
  });

  it("mounted HTTP execute-url is the same delivery kit", async () => {
    const result = await deliverSuppliedInput({
      jobId: "vendor-budget-impact",
      inputs: callerBudget(),
      http: true,
    });
    assert.equal(result.ok, true, result.order?.error || result.preflight?.error);
    assert.match(String(result.executeUrl), /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal(result.order.wrapper.contract, EXECUTION_CONTRACT_VERSION);
    assert.equal(result.completeness.ok, true);
    assert.equal(existsSync(join(result.runOutDir, "receipt.json")), true);
  });

  it("runOutDir remains receipt authority after stale published copy", async () => {
    const published = mkdtempSync(join(tmpdir(), "puj-deliv-stale-"));
    const result = await deliverSuppliedInput({
      jobId: "vendor-budget-impact",
      inputs: callerBudget(),
      publishedDir: published,
    });
    assert.equal(result.ok, true, result.order?.error);
    const jsonName = "budget-impact.json";
    const isolated = join(result.runOutDir, jsonName);
    const publishedJson = join(published, jsonName);
    const isolatedSha = sha256File(isolated);
    writeFileSync(publishedJson, '{"stale":true}\n');
    assert.notEqual(sha256File(publishedJson), isolatedSha);
    const listed = result.order.outputs.find((o) => o.name === jsonName);
    assert.equal(listed.sha256, isolatedSha);
    const again = verifyComplete({
      root: result.runOutDir,
      catalogPath: CATALOG_PATH,
      evidenceClass: "local-runtime",
    });
    assert.equal(again.ok, true, JSON.stringify(again));
    const publishedVerify = verifyComplete({
      root: published,
      catalogPath: CATALOG_PATH,
      evidenceClass: "local-runtime",
    });
    assert.equal(publishedVerify.ok, false);
  });

  it("schema-invalid pricing rows fail at preflight and would fail at D01 entry", async () => {
    const work = mkdtempSync(join(tmpdir(), "puj-deliv-schema-"));
    const bad = join(work, "before.json");
    writeFileSync(bad, `${JSON.stringify({ hello: "world" })}\n`);
    const pre = await runPreflightStage({
      jobId: "vendor-budget-impact",
      inputs: { before: bad, after },
    });
    assert.equal(pre.ok, false);
    assert.equal(pre.code, "input-schema-mismatch");
    const delivered = await deliverSuppliedInput({
      jobId: "vendor-budget-impact",
      inputs: { before: bad, after },
    });
    assert.equal(delivered.ok, false);
    assert.equal(delivered.stage, "preflight");
  });

  it("identical before/after is useful no-change delivery", async () => {
    const result = await deliverSuppliedInput({
      jobId: "vendor-budget-impact",
      inputs: { before, after: before },
    });
    assert.equal(result.ok, true, result.order?.error);
    assert.equal(result.order.wrapper.analysis.outcome, "informational");
    assert.equal(result.order.wrapper.delivery.complete, true);
    assert.equal(result.order.sold, false);
  });

  it("idempotent lost-response recovery replays the same orderId", async () => {
    const store = defaultFileStore(mkdtempSync(join(tmpdir(), "puj-deliv-replay-")));
    const first = await runCreateOrder(loadOrder("ord-1.json"), {
      store,
      requestDir: ORDERS,
      outDir: mkdtempSync(join(tmpdir(), "puj-deliv-ord-a-")),
    });
    assert.equal(first.ok, true, JSON.stringify(first));
    const replay = await runCreateOrder(loadOrder("ord-1.json"), {
      store,
      requestDir: ORDERS,
      outDir: mkdtempSync(join(tmpdir(), "puj-deliv-ord-b-")),
    });
    assert.equal(replay.ok, true);
    assert.equal(replay.replayed, true);
    assert.equal(replay.orderId, first.orderId);
    assert.equal(replay.termsHash, first.termsHash);
    await store.close?.();
  });

  it("concurrent reserve of the same orderId keeps one result", async () => {
    const store = defaultFileStore(mkdtempSync(join(tmpdir(), "puj-deliv-conc-")));
    const raw = loadOrder("ord-1.json");
    const [a, b] = await Promise.all([
      runCreateOrder(raw, { store, requestDir: ORDERS, outDir: mkdtempSync(join(tmpdir(), "puj-deliv-c1-")) }),
      runCreateOrder(raw, { store, requestDir: ORDERS, outDir: mkdtempSync(join(tmpdir(), "puj-deliv-c2-")) }),
    ]);
    assert.equal(a.ok, true, JSON.stringify(a));
    assert.equal(b.ok, true, JSON.stringify(b));
    assert.equal(a.orderId, b.orderId);
    assert.equal(a.termsHash, b.termsHash);
    const replayed = [a, b].filter((row) => row.replayed === true);
    assert.equal(replayed.length, 1);
    await store.close?.();
  });

  it("malformed JSON is refused at preflight before order", async () => {
    const work = mkdtempSync(join(tmpdir(), "puj-deliv-mal-"));
    const bad = join(work, "before.json");
    writeFileSync(bad, "{ this is not json");
    const delivered = await deliverSuppliedInput({
      jobId: "vendor-budget-impact",
      inputs: { before: bad, after },
    });
    assert.equal(delivered.ok, false);
    assert.equal(delivered.stage, "preflight");
    assert.ok(
      ["input-malformed", "input-malformed-json"].includes(delivered.preflight.code),
      delivered.preflight?.code,
    );
    assert.equal(delivered.sold, false);
  });

  it("1MiB+1 is input-oversize at preflight, not a useful order", async () => {
    const work = mkdtempSync(join(tmpdir(), "puj-deliv-over-"));
    const big = join(work, "after.json");
    writePaddedPricingJson(big, 1_048_576 + 1, { value: 3 });
    const delivered = await deliverSuppliedInput({
      jobId: "vendor-budget-impact",
      inputs: { before, after: big },
    });
    assert.equal(delivered.ok, false);
    assert.equal(delivered.stage, "preflight");
    assert.equal(delivered.preflight.code, "input-oversize");
  });

  it("SAMPLE sibling is disguised-sample at preflight, not a sale", async () => {
    const delivered = await deliverSuppliedInput({
      jobId: "vendor-budget-impact",
      inputs: {
        before: join(REPO_ROOT, "tools/job-input-preflight/fixtures/vendor-budget-impact/before.json"),
        after: join(REPO_ROOT, "tools/job-input-preflight/fixtures/vendor-budget-impact/after.json"),
      },
    });
    assert.equal(delivered.ok, false);
    assert.equal(delivered.stage, "preflight");
    assert.equal(delivered.preflight.code, "disguised-sample");
    assert.equal(delivered.sold, false);
  });

  it("missing artifact in isolated runOutDir is not complete", async () => {
    const result = await deliverSuppliedInput({
      jobId: "vendor-budget-impact",
      inputs: callerBudget(),
    });
    assert.equal(result.ok, true, result.order?.error);
    unlinkSync(join(result.runOutDir, "budget-impact.md"));
    const again = verifyComplete({
      root: result.runOutDir,
      catalogPath: CATALOG_PATH,
      evidenceClass: "local-runtime",
    });
    assert.equal(again.ok, false);
    assert.equal(again.code, "missing-output");
  });

  it("D01 --example SAMPLE can seed the mailbox but is not a buyer delivery", async () => {
    const mailbox = mkdtempSync(join(tmpdir(), "puj-deliv-sample-mail-"));
    const { wrapper, seed, execution } = seedVendorFromD01({
      mailbox,
      requestId: "req-sample-kit",
      example: true,
    });
    assert.equal(wrapper.status, 0, wrapper.stderr + wrapper.stdout);
    assert.equal(execution.ok, true, execution.error);
    assert.equal(execution.sample, true);
    assert.equal(execution.sold, false);
    assert.equal(seed.status, 0, seed.stderr + seed.stdout);
    const seeded = JSON.parse(seed.stdout);
    assert.equal(seeded.sample, true);
    assert.equal(seeded.deliveredToBuyer, false);
  });
});
