import assert from "node:assert/strict";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { assertUnpaidRequest, loadRuntime } from "../../buyer-runtimes/lib.mjs";
import {
  ensureUsefulJobsKit,
  loadHonestyInputs,
  runHonestyReport,
} from "../lib/honesty.mjs";
import { USEFUL_JOBS_ARCHIVE_BYTES, USEFUL_JOBS_ARCHIVE_SHA256 } from "../lib/pins.mjs";
import { parseStdout, runCli, tmpOut, TOOL_DIR } from "./helpers.mjs";

describe("literal user journey", () => {
  it("listing-repair-packet --example: purchaseAuthority false, no extract URL, mustNotRun preserved", async () => {
    const spawned = runCli(["journey"]);
    assert.equal(spawned.status, 0, spawned.stderr + spawned.stdout);
    const body = parseStdout(spawned);
    assert.equal(body.ok, true);
    assert.equal(body.purchaseAuthority, false);
    assert.equal(body.sold, false);
    assert.equal(body.settled, false);
    assert.equal(body.extractUrlObserved, false);
    assert.equal(body.extractBatchObserved, false);
    assert.equal(body.sellerIntegrityObserved, false);
    assert.equal(body.paymentSignaturePresent, false);
    assert.equal(body.mustNotRunPreserved, true);
    assert.deepEqual(body.mustNotRun, [
      "payX402 paid retry",
      "Agent402 route-execute",
      "wrapFetchWithPayment second fetch",
    ]);
    assert.equal(body.job.id, "listing-repair-packet");
    assert.equal(body.job.example, true);
    assert.equal(body.job.engineOk, true);
    assert.equal(body.job.appId, "listing-repair-packet");
    assert.equal(body.catalogs.usefulJobsPurchaseAuthority, false);
    assert.equal(body.catalogs.discoveryPurchaseAuthority, false);
    assert.equal(body.catalogs.paidExtractOffer, "sdd.paid_html_extract");
    assert.equal(body.kit.sha256, USEFUL_JOBS_ARCHIVE_SHA256);
    assert.equal(body.kit.bytes, USEFUL_JOBS_ARCHIVE_BYTES);
    assert.match(body.termsVersion, /^sha256:[0-9a-f]{64}$/);
    assert.equal(body.intercept.class, "local-runtime");
    assert.equal(body.osIsolation, false);
    assert.equal(body.enforcement.osIsolation, false);
    assert.equal(body.enforcement.kind, "js-hooks+path-stub+proxy-env");
    assert.equal(body.outcomeClass, "valid-unpaid");
    assert.equal(body.paymentAttemptDetected, false);
    assert.deepEqual(body.mustNotRunObserved, []);
    assert.equal(body.mustNotRunEvidenceClass, "job-stdout-stderr-text-scan");
    assert.equal(body.kit.extractedContentsVerified, false);
    assert.equal(body.kit.archiveVerified, true);
    assert.equal(body.evidenceClass.liveGet, "not-run");
    assert.equal(body.evidenceClass.enforcement, "js-hooks-not-os-isolation");
  });

  it("library report matches CLI on --example", async () => {
    const body = await runHonestyReport({ example: true });
    assert.equal(body.ok, true);
    assert.equal(body.purchaseAuthority, false);
    assert.equal(body.extractUrlObserved, false);
    assert.equal(body.mustNotRunPreserved, true);
  });

  it("caller run via --input kit sample still has no extract URL", async () => {
    const kit = ensureUsefulJobsKit();
    const input = join(kit.kit, "samples/listing/caller-alpha.json");
    assert.equal(existsSync(input), true);
    const body = await runHonestyReport({ example: false, input });
    assert.equal(body.ok, true, JSON.stringify(body.job));
    assert.equal(body.job.example, false);
    assert.equal(body.purchaseAuthority, false);
    assert.equal(body.extractUrlObserved, false);
    assert.equal(body.paymentSignaturePresent, false);
  });

  it("writes JSON when --out is set", () => {
    const out = tmpOut();
    const spawned = runCli(["report", "--example", "--out", out]);
    assert.equal(spawned.status, 0, spawned.stderr);
    assert.equal(existsSync(out), true);
    const written = JSON.parse(readFileSync(out, "utf8"));
    assert.equal(written.purchaseAuthority, false);
    assert.equal(written.extractUrlObserved, false);
  });

  it("buyer-runtimes unpaid construct is still the extract GET without payment headers", () => {
    const runtime = loadRuntime("agent402");
    assertUnpaidRequest(runtime.states.construct.request, assert);
    const loaded = loadHonestyInputs();
    assert.equal(loaded.stop.state, "stop");
    assert.equal(loaded.stop.reason, "no wallet");
    assert.equal(runtime.states.construct.request.url, loaded.buyerCatalog.route.exampleUrl);
  });
});
