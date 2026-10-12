import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { ARTIFACT_SEMANTICS, FORBIDDEN_COMPLETION_LABEL, PACK_REFS } from "../src/honesty.js";
import { reconcilePayout, NULL_PAYOUT_ADAPTER } from "../src/payout.js";
import { PROVENANCES } from "../src/types.js";
import { TEST_PROVENANCE } from "./helpers.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("kernel provenance never uses actual_completion; wraps pack honesty labels", async () => {
  const labels = await import(
    pathToFileURL(path.join(repoRoot, PACK_REFS.exchangeTownsquare, "src/labels.mjs")).href
  );
  assert.equal(labels.FORBIDDEN_COMPLETION_LABEL, "actual_completion");
  assert.equal(FORBIDDEN_COMPLETION_LABEL, labels.FORBIDDEN_COMPLETION_LABEL);
  assert.equal(PROVENANCES.includes(FORBIDDEN_COMPLETION_LABEL as never), false);
  assert.equal(TEST_PROVENANCE, "test");
  assert.equal(ARTIFACT_SEMANTICS.execute, false);
  assert.equal(ARTIFACT_SEMANTICS.fetchRef, false);
});

test("null payout reconciliation is an IOU, never paid/settled/sale", () => {
  const recon = reconcilePayout({ payoutState: "owed", obligation: null });
  assert.equal(recon.adapter, NULL_PAYOUT_ADAPTER);
  assert.equal(recon.payoutState, "none");
  assert.equal(recon.owed, false);
  assert.equal(recon.obligationId, null);
  assert.equal(recon.transfer, null);
  assert.equal(recon.paying, false);
  assert.equal(recon.paid, false);
  assert.equal(recon.settled, false);
  assert.equal(recon.sale, false);
});

test("owned packs and correspondence remain cited, not copied into this service", () => {
  const correspondence = readFileSync(path.join(repoRoot, PACK_REFS.correspondence, "package.json"), "utf8");
  assert.match(correspondence, /@neomorphic\/correspondence/);
  const preflight = readFileSync(path.join(repoRoot, PACK_REFS.capabilityPreflight, "package.json"), "utf8");
  assert.match(preflight, /capability-consumer-kit|s180-capability-consumer-kit/);
  const firstJob = readFileSync(path.join(repoRoot, PACK_REFS.outsideOperatorFirstJob, "README.md"), "utf8");
  assert.match(firstJob, /delivered artifact is not accepted until a distinct acceptance event exists/);
});
