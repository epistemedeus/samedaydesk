import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { JOB_IDS } from "../lib/jobs.mjs";
import { runPaidOffer, runPaidOffers } from "../lib/wrapper.mjs";
import {
  LIVE_EXTRACT_PRICE_USDC,
  LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC,
  FIXTURE_PRICE_USDC,
  USEFUL_JOBS_ARCHIVE_SHA256,
  USEFUL_JOBS_ARCHIVE_BYTES,
  USEFUL_JOBS_SOURCE_REPO,
  USEFUL_JOBS_SOURCE_COMMIT,
  USEFUL_JOBS_ARCHIVE_FREEZE,
  USEFUL_JOBS_REVIEWED_SOURCE,
} from "../lib/pins.mjs";
import { engineArchiveIdentity, engineProvenance } from "../lib/engine.mjs";
import {
  callerBudget,
  callerEvidence,
  callerFeed,
  callerRepeat,
  callerRepeatWithRoot,
  copyKitListing,
  copyKitOpenApi,
  loadReservedPayment,
} from "./helpers.mjs";

describe("paid useful-job wrappers", { timeout: 180_000 }, () => {
  it("runs vendor-budget-impact with caller files, reserved-fixture payment, usable outputs + receipt", async () => {
    const files = callerBudget();
    const result = await runPaidOffer({
      jobId: "vendor-budget-impact",
      inputs: files,
      fundingIntent: "reserved-fixture",
      payment: loadReservedPayment(),
    });
    assert.equal(result.ok, true, result.error);
    assert.equal(result.sold, false);
    assert.equal(result.fundingState, "reserved-fixture");
    assert.equal(result.sample, false);
    assert.equal(result.receipt.purchaseAuthority, false);
    assert.equal(result.receipt.liveSettlement, "out-of-scope");
    assert.equal(result.receipt.engine.version, "1.0.0");
    assert.equal(result.receipt.fixturePrice.amountUsdc, FIXTURE_PRICE_USDC);
    assert.notEqual(result.receipt.fixturePrice.amountUsdc, LIVE_EXTRACT_PRICE_USDC);
    assert.notEqual(result.receipt.fixturePrice.amountUsdc, LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC);
    assert.equal(result.outputs.length, 2);
    assert.equal(existsSync(result.outputs.find((o) => o.name === "budget-impact.json").path), true);
    assert.equal(existsSync(result.outputs.find((o) => o.name === "budget-impact.md").path), true);
    assert.match(result.receipt.inputsDigest, /^[0-9a-f]{64}$/);
    assert.match(result.receipt.outputsDigest, /^[0-9a-f]{64}$/);
    assert.equal(result.receipt.continuity.provenance.declinedPayment, false);
  });

  it("runs feed-agenda, evidence-ci-annotation, and repeat-job-record from caller files", async () => {
    const feed = await runPaidOffer({
      jobId: "feed-agenda",
      inputs: callerFeed(),
      fundingIntent: "unfunded",
    });
    assert.equal(feed.ok, true, feed.error);
    assert.equal(feed.fundingState, "unfunded");
    assert.ok(feed.outputs.some((o) => o.name === "agenda.json"));
    assert.ok(feed.outputs.some((o) => o.name === "agenda.ics"));

    const evidence = await runPaidOffer({
      jobId: "evidence-ci-annotation",
      inputs: callerEvidence(),
    });
    assert.equal(evidence.ok, true, evidence.error);
    assert.equal(evidence.sold, false);
    assert.ok(evidence.outputs.some((o) => o.name === "annotations.json"));

    const repeat = await runPaidOffer({
      jobId: "repeat-job-record",
      inputs: callerRepeat(),
    });
    assert.equal(repeat.ok, true, repeat.error);
    assert.ok(repeat.outputs.some((o) => o.name === "repeat-job.json"));
  });

  it("repeat-job-record --input-root directory yields verified identity and a receipt", async () => {
    const result = await runPaidOffer({
      jobId: "repeat-job-record",
      inputs: callerRepeatWithRoot(),
    });
    assert.equal(result.ok, true, result.error);
    assert.equal(result.code, undefined);
    assert.equal(result.sold, false);
    assert.ok(result.outputs.some((o) => o.name === "repeat-job.json"));
    assert.ok(result.outputs.some((o) => o.name === "repeat-job.md"));
    assert.equal(result.engine.identityVerified, true);
    assert.equal(result.receipt.engineResult.identityVerified, true);
    const rootEntry = result.receipt.inputs.find((i) => i.name === "input-root");
    assert.equal(rootEntry.kind, "directory");
    assert.equal(rootEntry.sha256, null);
    assert.equal(rootEntry.path, callerRepeatWithRoot()["input-root"]);
    assert.equal(result.receipt.inputRoot, callerRepeatWithRoot()["input-root"]);
    const { readFileSync } = await import("node:fs");
    const artifact = JSON.parse(readFileSync(result.outputs.find((o) => o.name === "repeat-job.json").path, "utf8"));
    assert.equal(artifact.identityVerified, true);
  });

  it("receipt engine provenance matches ensureUsefulJobsKit archive pins", async () => {
    const result = await runPaidOffer({
      jobId: "vendor-budget-impact",
      inputs: callerBudget(),
    });
    assert.equal(result.ok, true, result.error);
    const expected = engineProvenance();
    assert.equal(result.receipt.engine.archiveSha256, USEFUL_JOBS_ARCHIVE_SHA256);
    assert.equal(result.receipt.engine.archiveBytes, USEFUL_JOBS_ARCHIVE_BYTES);
    assert.equal(result.receipt.engine.sourceRepo, USEFUL_JOBS_SOURCE_REPO);
    assert.equal(result.receipt.engine.sourceCommit, USEFUL_JOBS_SOURCE_COMMIT);
    assert.equal(result.receipt.engine.archiveFreeze, USEFUL_JOBS_ARCHIVE_FREEZE);
    assert.equal(result.receipt.engine.reviewedSource, USEFUL_JOBS_REVIEWED_SOURCE);
    assert.equal(result.receipt.engine.archiveSha256, expected.archiveSha256);
    assert.equal(engineArchiveIdentity(result.receipt.engine), engineArchiveIdentity(expected));
    assert.equal(
      engineArchiveIdentity({ ...expected, version: "9.9.9" }),
      engineArchiveIdentity(expected),
    );
    assert.notEqual(
      engineArchiveIdentity({ ...expected, archiveSha256: "0".repeat(64) }),
      engineArchiveIdentity(expected),
    );
  });

  it("runs api-upgrade-brief and listing-repair-packet from copied kit files (not silent substitution)", async () => {
    const work = mkdtempSync(join(tmpdir(), "puj-copy-"));
    const openapi = copyKitOpenApi(join(work, "openapi"));
    const listing = copyKitListing(join(work, "listing"));

    const brief = await runPaidOffer({
      jobId: "api-upgrade-brief",
      inputs: openapi,
      fundingIntent: "reserved-fixture",
      payment: loadReservedPayment(),
    });
    assert.equal(brief.ok, true, brief.error);
    assert.equal(brief.sample, false);
    assert.ok(brief.outputs.some((o) => o.name === "upgrade-brief.json"));
    assert.ok(brief.outputs.some((o) => o.name === "upgrade-brief.md"));

    const packet = await runPaidOffer({
      jobId: "listing-repair-packet",
      inputs: listing,
    });
    assert.equal(packet.ok, true, packet.error);
    assert.ok(packet.outputs.some((o) => o.name === "repair-packet.json"));
    // Copied listing JSON still carries sampleLabel SAMPLE; unfunded is allowed,
    // reserved-fixture payment is not (see seeded-failures a4).
    assert.equal(packet.sample, true);
    assert.equal(packet.fundingState, "unfunded");
    assert.equal(packet.sold, false);
  });

  it("example flag produces labeled sample output and is not a sale", async () => {
    const result = await runPaidOffer({
      jobId: "vendor-budget-impact",
      example: true,
      fundingIntent: "unfunded",
    });
    assert.equal(result.ok, true, result.error);
    assert.equal(result.sample, true);
    assert.ok(result.sampleReasons.includes("example-flag"));
    assert.equal(result.sold, false);
    assert.notEqual(result.fundingState, "rejected");
  });

  it("partial failure on one job does not mark the others sold", async () => {
    const batch = await runPaidOffers([
      {
        jobId: "vendor-budget-impact",
        inputs: callerBudget(),
        fundingIntent: "reserved-fixture",
        payment: loadReservedPayment(),
      },
      {
        jobId: "api-upgrade-brief",
        inputs: { before: callerBudget().before },
      },
    ]);
    assert.equal(batch.sold, false);
    assert.equal(batch.results[0].ok, true);
    assert.equal(batch.results[0].sold, false);
    assert.equal(batch.results[1].ok, false);
    assert.equal(batch.results[1].fundingState, "rejected");
    assert.equal(batch.results[1].code, "missing-required-inputs");
    assert.equal(batch.results[0].fundingState, "reserved-fixture");
    assert.equal(JOB_IDS.length, 6);
  });

  it("accepts inline JSON objects as caller input", async () => {
    const { readFileSync } = await import("node:fs");
    const result = await runPaidOffer({
      jobId: "evidence-ci-annotation",
      inputs: { input: JSON.parse(readFileSync(callerEvidence().input, "utf8")) },
    });
    assert.equal(result.ok, true, result.error);
    assert.ok(result.outputs.some((o) => o.name === "annotations.md"));
  });
});
