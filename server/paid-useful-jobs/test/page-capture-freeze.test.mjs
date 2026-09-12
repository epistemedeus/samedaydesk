import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { createHash } from "node:crypto";
import { loadDeliveryCatalog } from "../lib/delivery-catalog.mjs";
import { orderRequestFromPreflight, runPreflightStage } from "../lib/delivery-kit.mjs";
import { defaultFileStore, runCreateOrder } from "../../../tools/managed-useful-jobs-order/lib/create-order.mjs";
import { REPO_ROOT } from "../lib/pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const PAGE = join(REPO_ROOT, "tools/page-change-offline-job/fixtures/customer-job");

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("page nested captures freeze at prepare", { timeout: 120_000 }, () => {
  it("overwrite after.json after preflight still executes inspect bytes and binds them", async () => {
    const work = mkdtempSync(join(tmpdir(), "puj-page-freeze-"));
    copyFileSync(join(PAGE, "job.json"), join(work, "job.json"));
    copyFileSync(join(PAGE, "before.json"), join(work, "before.json"));
    copyFileSync(join(PAGE, "after.json"), join(work, "after.json"));
    const inspectAfter = sha256File(join(work, "after.json"));
    const inspectJob = sha256File(join(work, "job.json"));
    const catalog = loadDeliveryCatalog();
    const pre = await runPreflightStage({
      jobId: "page-change-offline-job",
      inputs: { job: join(work, "job.json") },
      catalog,
      outDir: mkdtempSync(join(tmpdir(), "puj-page-pre-")),
    });
    assert.equal(pre.ok, true, JSON.stringify(pre));
    assert.equal(pre.inputs["job-after"]?.sha256, inspectAfter);
    copyFileSync(join(work, "before.json"), join(work, "after.json"));
    assert.notEqual(sha256File(join(work, "after.json")), inspectAfter);
    const raw = orderRequestFromPreflight(pre, {
      orderId: `ord-page-freeze-${Date.now()}`,
      catalog,
    });
    assert.equal(raw.inputs.some((row) => row.sha256 === inspectAfter), true);
    assert.equal(raw.inputs.some((row) => row.sha256 === inspectJob), true);
    const order = await runCreateOrder(raw, {
      store: defaultFileStore(mkdtempSync(join(tmpdir(), "puj-page-store-"))),
      outDir: mkdtempSync(join(tmpdir(), "puj-page-pub-")),
      catalog,
    });
    assert.equal(order.ok, true, order.error || order.code);
    assert.equal(order.wrapper.analysis.outcome, "actionable");
    const receiptInputs = order.wrapper?.receipt?.inputs || [];
    assert.equal(receiptInputs.some((row) => row.sha256 === inspectAfter), true);
    const report = JSON.parse(readFileSync(join(order.runOutDir, "page-change.json"), "utf8"));
    assert.equal(report.report?.verdict || report.verdict, "changed");
    void here;
  });
});
