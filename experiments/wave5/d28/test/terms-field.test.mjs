import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  FIXTURE_PRICE_USDC,
  LIVE_EXTRACT_PRICE_USDC,
  LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC,
} from "../lib/pins.mjs";
import { FIELD_EVIDENCE_SCHEMA, readFieldEvidence } from "../lib/field.mjs";
import { distinctDocumentIdentities, refuseIntegerTermsVersion } from "../lib/terms.mjs";
import { INVENTED_EVIDENCE, parseJson, SDS52_CALLER, spawnD28 } from "./helpers.mjs";

describe("terms identity and field evidence", { timeout: 180_000 }, () => {
  it("integer termsVersion is refused and unlike documents stay unlike", () => {
    const packed = spawnD28([
      "pack",
      "--out-dir",
      mkdtempSync(join(tmpdir(), "d28-terms-")),
      "--before",
      SDS52_CALLER.before,
      "--after",
      SDS52_CALLER.after,
      "--payment",
      SDS52_CALLER.payment,
    ]);
    assert.equal(packed.status, 0, packed.stderr + packed.stdout);
    const body = parseJson(packed.stdout);
    const receipt = {
      schema: body.packet.firstJob.receiptSchema,
      inputsDigest: body.packet.firstJob.inputsDigest,
      engine: { archiveSha256: body.packet.engineArchive.sha256 },
    };
    const identities = distinctDocumentIdentities({
      receipt,
      fixturePrice: FIXTURE_PRICE_USDC,
      liveExtract: LIVE_EXTRACT_PRICE_USDC,
      termsVersion: "sha256:c82f232dd9d63261b91d32234abf3e0f655d99182cde7c66b7de5c8c787ea31f",
    });
    assert.equal(identities.forcedEqual, false);
    assert.notEqual(identities.inputsDigest, LIVE_EXTRACT_PRICE_USDC);
    assert.notEqual(identities.inputsDigest, LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC);
    assert.notEqual(identities.inputsDigest, FIXTURE_PRICE_USDC);
    assert.notEqual(
      identities.inputsDigest,
      "c82f232dd9d63261b91d32234abf3e0f655d99182cde7c66b7de5c8c787ea31f",
    );
    assert.equal(refuseIntegerTermsVersion(1).ok, false);
    assert.equal(refuseIntegerTermsVersion("2").code, "integer-terms-version");
    assert.equal(refuseIntegerTermsVersion("sha256:c82f232dd9d63261b91d32234abf3e0f655d99182cde7c66b7de5c8c787ea31f").ok, true);
  });

  it("CLI --terms-version 1 is refused", () => {
    const r = spawnD28([
      "pack",
      "--terms-version",
      "1",
      "--out-dir",
      mkdtempSync(join(tmpdir(), "d28-tv-")),
    ]);
    assert.equal(r.status, 2);
    const body = parseJson(r.stdout);
    assert.equal(body.code, "integer-terms-version");
  });

  it("missing evidence is absent; invented customer evidence is rejected", () => {
    assert.equal(readFieldEvidence(null).liveReturn, "absent");
    const invented = readFieldEvidence(INVENTED_EVIDENCE);
    assert.equal(invented.liveReturn, "rejected");
    assert.equal(invented.reason, "invented-customer-rejected");
    assert.equal(invented.invented, true);

    const packetDir = mkdtempSync(join(tmpdir(), "d28-field-"));
    const packed = spawnD28([
      "pack",
      "--out-dir",
      packetDir,
      "--before",
      SDS52_CALLER.before,
      "--after",
      SDS52_CALLER.after,
      "--payment",
      SDS52_CALLER.payment,
      "--evidence",
      INVENTED_EVIDENCE,
    ]);
    assert.equal(packed.status, 0);
    const body = parseJson(packed.stdout);
    assert.equal(body.packet.field.liveReturn, "rejected");
    assert.equal(body.packet.field.invented, true);
    assert.notEqual(body.packet.field.liveReturn, "useful-second-job");
  });

  it("well-shaped owner-qa evidence still does not mark sold or deploy", () => {
    const packetDir = mkdtempSync(join(tmpdir(), "d28-ev-"));
    const packed = spawnD28([
      "pack",
      "--out-dir",
      packetDir,
      "--before",
      SDS52_CALLER.before,
      "--after",
      SDS52_CALLER.after,
      "--payment",
      SDS52_CALLER.payment,
    ]);
    assert.equal(packed.status, 0);
    const first = parseJson(packed.stdout);
    const evidence = join(packetDir, "evidence.json");
    writeFileSync(
      evidence,
      `${JSON.stringify({
        schema: FIELD_EVIDENCE_SCHEMA,
        label: "owner-qa",
        jobId: "vendor-budget-impact",
        receiptSha256: first.packet.firstJob.receipt.sha256,
        sold: false,
        invented: false,
        deployedArtifact: "absent",
        returnSignal: "observed",
        observedAt: "2026-09-11T22:00:00.000Z",
      })}\n`,
    );
    const rb = spawnD28(["readback", "--packet", packetDir, "--evidence", evidence]);
    assert.equal(rb.status, 0, rb.stderr + rb.stdout);
    const body = parseJson(rb.stdout);
    assert.equal(body.field.label, "owner-qa");
    assert.equal(body.field.sold, false);
    assert.equal(body.field.deployedArtifact, "absent");
    assert.equal(body.packet.deploy.deployed, false);
  });
});
