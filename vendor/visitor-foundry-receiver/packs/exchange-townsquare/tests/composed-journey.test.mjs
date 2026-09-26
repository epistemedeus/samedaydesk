import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  ACCEPTANCE_KIND,
  COMPLETION_LABEL,
  FORBIDDEN_COMPLETION_LABEL,
  JOURNEY_OUTCOME,
  PROVENANCE,
  isReceiptStructurallyValid,
  receiptMatchesJourney,
  runComposedLabJourney,
  verifyComposedReceipt,
} from "../src/composed-journey.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const cli = join(root, "../src/cli.mjs");
const clock = () => Date.parse("2026-09-10T18:00:00.000Z");

test("composed happy path: townsquare → bound accept → local gates pass as fixture_demo", () => {
  const out = runComposedLabJourney({ mode: "happy", clock });
  assert.equal(out.ok, true);
  assert.equal(out.outcome, JOURNEY_OUTCOME.ACCEPTED);
  assert.equal(out.acceptanceKind, ACCEPTANCE_KIND.COUNTERPARTY_ACCEPTANCE);
  assert.equal(out.localRunOk, true);
  assert.equal(out.actualCompletion, false);
  assert.equal(out.provenance, PROVENANCE.FIXTURE_DEMO);
  assert.equal(out.completionLabel, COMPLETION_LABEL.FIXTURE_DEMO);
  assert.notEqual(out.completionLabel, FORBIDDEN_COMPLETION_LABEL);
  assert.equal(out.replay.matched, true);
  assert.equal(out.replay.structurallyValid, true);
  assert.ok(out.townsquare.scopedTaskId);
  assert.equal(out.exchange.lifecycle.status, "completed");
  assert.deepEqual(out.exchange.lifecycle.paymentActions, []);
});

test("composed objective_auto: automatic objective evidence without new human ritual", () => {
  const out = runComposedLabJourney({ mode: "objective_auto", clock });
  assert.equal(out.ok, true);
  assert.equal(out.outcome, JOURNEY_OUTCOME.ACCEPTED);
  assert.equal(out.acceptanceKind, ACCEPTANCE_KIND.AUTOMATIC_OBJECTIVE_EVIDENCE);
  assert.equal(out.localRunOk, true);
  assert.equal(out.actualCompletion, false);
  assert.equal(out.completionLabel, COMPLETION_LABEL.FIXTURE_DEMO);
});

test("composed correction then bound accept", () => {
  const out = runComposedLabJourney({ mode: "correction", clock });
  assert.equal(out.ok, true);
  assert.equal(out.outcome, JOURNEY_OUTCOME.ACCEPTED);
  assert.equal(out.acceptanceKind, ACCEPTANCE_KIND.COUNTERPARTY_ACCEPTANCE);
});

test("composed explicit reject is terminal", () => {
  const out = runComposedLabJourney({ mode: "reject", clock });
  assert.equal(out.ok, false);
  assert.equal(out.outcome, JOURNEY_OUTCOME.REJECTED);
  assert.equal(out.acceptanceKind, ACCEPTANCE_KIND.NONE);
  assert.equal(out.actualCompletion, false);
  assert.equal(out.completionLabel, COMPLETION_LABEL.FIXTURE_DEMO);
  assert.notEqual(out.exchange.lifecycle?.status, "completed");
});

test("mismatched replay and missing replay input fail; structural validity separate", () => {
  const out = runComposedLabJourney({ mode: "objective_auto", clock });
  assert.equal(isReceiptStructurallyValid(out.receipt), true);
  assert.equal(receiptMatchesJourney(out.receipt, out.exchange, null), false);
  assert.equal(receiptMatchesJourney(out.receipt, out.exchange, undefined), false);

  const verifiedMissing = verifyComposedReceipt(out.receipt, null, { clock });
  assert.equal(verifiedMissing.structurallyValid, true);
  assert.equal(verifiedMissing.replayMatched, false);
  assert.equal(verifiedMissing.reason, "replay_input_required");

  const again = runComposedLabJourney({ mode: "objective_auto", clock });
  assert.equal(again.exchangeInputFingerprintSha256, out.exchangeInputFingerprintSha256);

  const missingProposal = { ...out.receipt, proposalId: null };
  assert.equal(isReceiptStructurallyValid(missingProposal), true);
  // Without the exact exchange input we cannot claim replay match; fingerprint-alone is insufficient.
  assert.equal(receiptMatchesJourney(missingProposal, again.exchange, null), false);
});

test("partial / no-correction stays non-completed", () => {
  const partial = JSON.parse(
    readFileSync(join(root, "../exchange/01/fixtures/artifact.partial.json"), "utf8"),
  );
  const out = runComposedLabJourney({
    mode: "gate",
    clock,
    exchangeOverrides: {
      artifact: partial,
      correctedArtifact: undefined,
      requesterDecision: undefined,
      clearSubjective: true,
    },
  });
  assert.equal(out.ok, false);
  assert.notEqual(out.outcome, JOURNEY_OUTCOME.ACCEPTED);
  assert.equal(out.actualCompletion, false);
  assert.equal(out.completionLabel, COMPLETION_LABEL.FIXTURE_DEMO);
});

test("CLI demo + preflight + replay-arg regression", () => {
  const dir = mkdtempSync(join(tmpdir(), "s177-composed-"));
  const receiptPath = join(dir, "receipt.json");
  const demo = spawnSync(
    process.execPath,
    [cli, "demo", "--mode", "objective_auto", "--receipt", receiptPath, "--clock", "2026-09-10T18:00:00.000Z"],
    { encoding: "utf8" },
  );
  assert.equal(demo.status, 0, demo.stderr || demo.stdout);
  const summary = JSON.parse(demo.stdout);
  assert.equal(summary.ok, true);
  assert.equal(summary.acceptanceKind, ACCEPTANCE_KIND.AUTOMATIC_OBJECTIVE_EVIDENCE);
  assert.equal(summary.completionLabel, COMPLETION_LABEL.FIXTURE_DEMO);
  assert.equal(summary.actualCompletion, false);
  assert.equal(isReceiptStructurallyValid(JSON.parse(readFileSync(receiptPath, "utf8"))), true);

  const bad = spawnSync(process.execPath, [cli, "replay", "--receipt", receiptPath], {
    encoding: "utf8",
  });
  assert.equal(bad.status, 2);

  const pre = spawnSync(process.execPath, [cli, "preflight"], { encoding: "utf8" });
  assert.equal(pre.status, 0, pre.stderr || pre.stdout);
  assert.equal(JSON.parse(pre.stdout).ok, true);
});
