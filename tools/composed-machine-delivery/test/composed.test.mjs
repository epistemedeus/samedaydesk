import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { quoteEconomics } from "../../../vendor/hosted-wallet-market/src/fee.mjs";
import { produceRecurringResult } from "../../recurring-decision-consumer/src/recurring-result.mjs";
import { previewReuse } from "../../result-reuse/src/export.mjs";
import { findDisallowedRewardKey } from "../../two-sided-work-consumer/src/public.mjs";
import { composeDelivery, recoverDelivery } from "../src/deliver.mjs";
import { digest } from "../src/json.mjs";
import { retainCapture } from "../src/retain.mjs";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const requestPath = fileURLToPath(new URL("../examples/changed-request.json", import.meta.url));
const outputPath = fileURLToPath(new URL("../examples/retained-output.json", import.meta.url));
const BASE = "c60641e8ff2b94dd704307e57f5b6fe789ba0df7";
const ATOMS = ["2000000", "100000", "1900000", "earnedDebtAtomic", "feeBps", "experiment", "owner-qa", "ownerQa", "Voluntary paid"];

function loadRequest() {
  return JSON.parse(readFileSync(requestPath, "utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function freshStore() {
  return mkdtempSync(join(tmpdir(), "composed-delivery-"));
}

function hidden(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return ATOMS.filter((atom) => text.includes(atom));
}

function observationOnly(request) {
  const next = clone(request);
  next.extension = { need: "observation" };
  delete next.work;
  return next;
}

test("representative delivery retains the changed capture and matches the frozen public output", () => {
  const request = loadRequest();
  const store = freshStore();
  const result = composeDelivery(request, { store });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.duplicateEffect, "applied");
  assert.deepEqual(result.public, JSON.parse(readFileSync(outputPath, "utf8")));
  assert.deepEqual(hidden(result.public), []);
  assert.equal(findDisallowedRewardKey(result.public), null);
  assert.equal(result.public.capture.transferred, true);
  assert.equal(result.public.decisions.filter((row) => row.outcome === "useful_change").length, 1);
  assert.equal(result.public.decisions.filter((row) => row.outcome === "useful_no_change").length, 2);
  assert.equal(result.public.extension.selected, "native");
  assert.equal(result.public.extension.acquired, true);
  assert.equal(result.public.extension.directObservationMatches, true);
  assert.equal(result.public.extension.published, false);
  assert.equal(result.public.work.accepted, true);
  assert.equal(result.public.work.readback.evidenceOutcome, "meets_criteria");
  assert.equal(result.public.work.readback.rewardDisclosed, false);
  assert.equal(result.public.repeatUse.ran, false);
  assert.equal(result.public.pricingInvented, false);
  assert.equal(result.public.published, false);

  const receipt = JSON.parse(readFileSync(join(store, "receipt.json"), "utf8"));
  assert.equal(receipt.appliedCount, 1);
  assert.equal(receipt.private.quote.platformFeeAtomic, "100000");
  assert.equal(receipt.private.quote.contributorNetAtomic, "1900000");
  assert.equal(receipt.private.quote.feeBps, 500);
  assert.equal(receipt.private.quote.thisQuoteFeeIsExactFivePercent, true);
  const quote = quoteEconomics({ gross: "2000000", railCost: "0", captures: ["2000000"] });
  assert.equal(receipt.private.quote.platformFeeAtomic, quote.platformFeeAtomic);
  assert.equal(receipt.private.quote.contributorNetAtomic, quote.contributorNetAtomic);
  assert.equal(receipt.private.earnedDebtAtomic, "21");
  const journey = JSON.parse(readFileSync(join(store, "journey.json"), "utf8"));
  assert.equal(journey.task.termsDigest, request.originalTerms.termsDigest);
  assert.equal(journey.task.rightsDigest, request.originalTerms.rightsDigest);
  assert.equal(journey.task.terms.feeBps, 500);
  assert.equal(journey.task.terms.feeBasis, "new_job_gross");
  assert.equal(journey.task.grossAtomic, "2000000");
  assert.equal(journey.delivery.artifact.heading, request.capture.payload.title);
  assert.equal(journey.acceptance.accepted, true);
  assert.equal(journey.ledger, false);
  assert.equal(journey.paymentCommand, false);

  const decisions = produceRecurringResult({
    capture: request.capture,
    intents: request.intents,
    priors: request.priors,
    schedule: request.schedule,
    clock: request.clock,
    horizonHours: request.horizonHours,
    cancel: false,
  });
  assert.deepEqual(
    result.public.decisions.map((row) => [row.intentId, row.outcome]),
    decisions.decisions.map((row) => [row.intentId, row.result.outcome]),
  );
  const preview = previewReuse(request.extension.input, {
    taskId: "example-page",
    subject: "example-page",
    sequence: 1,
    clock: request.clock,
  });
  assert.equal(preview.ok, true, preview.message);
  assert.equal(digest(preview.observation), result.public.extension.observationDigest);
});

test("the same delivery replays once and a different effect conflicts", () => {
  const request = loadRequest();
  const store = freshStore();
  const first = composeDelivery(request, { store });
  assert.equal(first.ok, true, JSON.stringify(first));
  const fencing = JSON.parse(readFileSync(join(store, "receipt.json"), "utf8")).private.fencing;
  const replay = composeDelivery(request, { store });
  assert.equal(replay.ok, true, JSON.stringify(replay));
  assert.equal(replay.duplicateEffect, "replay");
  assert.equal(replay.public.duplicateEffect, "replay");
  const receipt = JSON.parse(readFileSync(join(store, "receipt.json"), "utf8"));
  assert.equal(receipt.appliedCount, 1);
  assert.equal(receipt.private.fencing, fencing);
  assert.equal(JSON.parse(readFileSync(join(store, "journal.json"), "utf8")).effects.length, 1);
  const changed = clone(request);
  changed.clock = "2026-11-06T13:00:00.000Z";
  const conflict = composeDelivery(changed, { store });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.reason, "delivery_effect_conflict");
  assert.equal(JSON.parse(readFileSync(join(store, "receipt.json"), "utf8")).private.fencing, fencing);
});

test("a lost receipt resumes the same journey without a second effect", () => {
  const request = loadRequest();
  const store = freshStore();
  assert.equal(composeDelivery(request, { store }).ok, true);
  const before = JSON.parse(readFileSync(join(store, "receipt.json"), "utf8"));
  unlinkSync(join(store, "receipt.json"));
  const resumed = composeDelivery(request, { store });
  assert.equal(resumed.ok, true, JSON.stringify(resumed));
  const after = JSON.parse(readFileSync(join(store, "receipt.json"), "utf8"));
  assert.equal(after.appliedCount, 1);
  assert.equal(after.private.fencing, before.private.fencing);
  assert.equal(after.private.quote.platformFeeAtomic, "100000");
  assert.equal(JSON.parse(readFileSync(join(store, "journal.json"), "utf8")).effects.length, 1);
});

test("capture loss restores the recovery copy and ignores a partial temp file", () => {
  const request = loadRequest();
  const store = freshStore();
  assert.equal(composeDelivery(request, { store }).ok, true);
  unlinkSync(join(store, "capture.json"));
  const restored = recoverDelivery(store);
  assert.equal(restored.ok, true, JSON.stringify(restored));
  assert.equal(restored.recovered, true);
  assert.equal(restored.source, "recovery");
  assert.equal(restored.captureId, "owned-example-page-changed");
  writeFileSync(join(store, "capture.json"), "{not json");
  const repaired = recoverDelivery(store);
  assert.equal(repaired.ok, true, JSON.stringify(repaired));
  assert.equal(repaired.source, "recovery");
  const empty = freshStore();
  writeFileSync(join(empty, "note.tmp-dead"), "{\"captureId\":\"promoted\"}\n");
  const lost = recoverDelivery(empty);
  assert.equal(lost.ok, false);
  assert.equal(lost.reason, "capture_lost");
  assert.equal(existsSync(join(empty, "capture.json")), false);
  assert.equal(existsSync(join(empty, "note.tmp-dead")), false);
});

test("replace keeps the previous capture and deliver does not replace a different one", () => {
  const request = loadRequest();
  const store = freshStore();
  const other = clone(request.capture);
  other.captureId = "owned-example-page-other";
  other.payload = { ...other.payload, title: "Example Domain" };
  const first = retainCapture({ store, capture: request.capture, clock: request.clock, actor: request.actor });
  assert.equal(first.ok, true, JSON.stringify(first));
  const same = retainCapture({ store, capture: request.capture, clock: request.clock, actor: request.actor });
  assert.equal(same.duplicateEffect, "none");
  const replaced = retainCapture({ store, capture: other, clock: request.clock, actor: request.actor, replace: true });
  assert.equal(replaced.ok, true, JSON.stringify(replaced));
  const back = recoverDelivery(store, { previous: true });
  assert.equal(back.ok, true, JSON.stringify(back));
  assert.equal(back.source, "previous");
  assert.equal(back.captureId, request.capture.captureId);
  const occupied = freshStore();
  assert.equal(retainCapture({ store: occupied, capture: other, clock: request.clock, actor: request.actor }).ok, true);
  const refused = composeDelivery(request, { store: occupied });
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, "capture_already_retained");
  assert.equal(existsSync(join(occupied, "journey.json")), false);
});

test("stale, cancelled, and unsupported captures do not open work", () => {
  const staleRequest = observationOnly(loadRequest());
  staleRequest.horizonHours = 0.5;
  staleRequest.schedule.scope.horizonHours = 0.5;
  const staleStore = freshStore();
  const stale = composeDelivery(staleRequest, { store: staleStore });
  assert.equal(stale.ok, true, JSON.stringify(stale));
  assert.equal(stale.public.decisions.every((row) => row.outcome === "stale"), true);
  assert.equal(stale.public.decisions[0].reason, "capture_outside_horizon");
  assert.equal(stale.public.work.appropriate, false);
  assert.equal(stale.public.work.reason, "no_useful_change");
  assert.equal(existsSync(join(staleStore, "journey.json")), false);

  const cancelledRequest = observationOnly(loadRequest());
  cancelledRequest.cancel = true;
  const cancelled = composeDelivery(cancelledRequest, { store: freshStore() });
  assert.equal(cancelled.ok, true, JSON.stringify(cancelled));
  assert.equal(cancelled.public.decisionOutcome, "cancelled");
  assert.equal(cancelled.public.decisions.length, 0);
  assert.equal(cancelled.public.work.reason, "schedule_cancelled");

  const unsupportedRequest = observationOnly(loadRequest());
  unsupportedRequest.capture.schema = "samedaydesk.not-a-capture.v1";
  const unsupportedStore = freshStore();
  const unsupported = composeDelivery(unsupportedRequest, { store: unsupportedStore });
  assert.equal(unsupported.ok, true, JSON.stringify(unsupported));
  assert.equal(unsupported.public.extension.executionDeclaration, "unsupported_execution");
  assert.equal(unsupported.public.work.reason, "capture_schema_unsupported");
  assert.equal(existsSync(join(unsupportedStore, "journey.json")), false);
  assert.equal(existsSync(join(unsupportedStore, "capture.json")), false);
  const replay = composeDelivery(unsupportedRequest, { store: unsupportedStore });
  assert.equal(replay.duplicateEffect, "replay");
  assert.deepEqual(hidden(unsupported.public), []);
});

test("rewritten terms are refused and the original terms stay on the request", () => {
  const request = observationOnly(loadRequest());
  request.work = clone(loadRequest().work);
  request.originalTerms.rewriteTerms = true;
  const store = freshStore();
  const refused = composeDelivery(request, { store });
  assert.equal(refused.ok, true, JSON.stringify(refused));
  assert.equal(refused.public.work.appropriate, false);
  assert.equal(refused.public.work.reason, "terms_unchanged_required");
  assert.equal(refused.public.originalTermsPreserved, false);
  assert.equal(existsSync(join(store, "journey.json")), false);
});

test("workflow selection distinguishes fitting, direct, non-fitting, blocked, and mismatched inputs", () => {
  const fitting = observationOnly(loadRequest());
  fitting.extension = {
    need: "observation",
    input: loadRequest().extension.input,
    taskId: "example-page",
    subject: "example-page",
    sequence: 1,
    publish: false,
  };
  const direct = composeDelivery(fitting, { store: freshStore() });
  assert.equal(direct.ok, true, JSON.stringify(direct));
  assert.equal(direct.public.extension.selected, "direct");
  assert.equal(direct.public.extension.fitting, true);
  assert.equal(direct.public.extension.acquired, false);
  assert.equal(direct.public.extension.executionDeclaration, "direct_cli");
  assert.equal(direct.public.extension.directObservationMatches, true);

  const nonfit = observationOnly(loadRequest());
  nonfit.extension = {
    need: "local-process",
    site: "samedaydesk",
    input: { task: "Write a cheerful marketing email about our spring sale" },
  };
  const nonfitStore = freshStore();
  const skipped = composeDelivery(nonfit, { store: nonfitStore });
  assert.equal(skipped.ok, true, JSON.stringify(skipped));
  assert.equal(skipped.public.extension.fitting, false);
  assert.equal(skipped.public.extension.acquired, false);
  assert.equal(skipped.public.extension.executionDeclaration, "unsupported_execution");
  assert.equal(existsSync(join(nonfitStore, "extensions")), false);

  const blocked = observationOnly(loadRequest());
  blocked.extension = { need: "ghost", site: "samedaydesk" };
  const blockedStore = freshStore();
  const ghost = composeDelivery(blocked, { store: blockedStore });
  assert.equal(ghost.ok, true, JSON.stringify(ghost));
  assert.equal(ghost.public.extension.executionDeclaration, "unsupported_execution");
  assert.equal(ghost.public.extension.acquired, false);
  assert.equal(existsSync(join(blockedStore, "extensions")), false);

  const mismatch = clone(loadRequest());
  delete mismatch.work;
  mismatch.extension.input = { ...mismatch.extension.input, title: "Other heading" };
  const mismatched = composeDelivery(mismatch, { store: freshStore() });
  assert.equal(mismatched.ok, false);
  assert.equal(mismatched.reason, "capture_mismatch");

  const missingSite = clone(loadRequest());
  delete missingSite.work;
  delete missingSite.extension.site;
  const site = composeDelivery(missingSite, { store: freshStore() });
  assert.equal(site.ok, false);
  assert.equal(site.reason, "site_required");

  const publish = clone(loadRequest());
  publish.extension.publish = true;
  const refused = composeDelivery(publish, { store: freshStore() });
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, "publication_refused");
  assert.equal(refused.published, false);
});

test("optional sharing keeps the public proof free of reward amounts", () => {
  const request = observationOnly(loadRequest());
  request.extension = {
    need: "observation",
    input: loadRequest().extension.input,
    taskId: "example-page",
    subject: "example-page",
    sequence: 1,
  };
  request.work = clone(loadRequest().work);
  request.work.share = true;
  request.work.publicationConsent = true;
  request.work.proofSubject = "example-page";
  request.work.proofSequence = 1;
  const store = freshStore();
  const shared = composeDelivery(request, { store });
  assert.equal(shared.ok, true, JSON.stringify(shared));
  assert.equal(shared.public.work.shared, true);
  assert.equal(shared.public.work.proof.rewardDisclosed, false);
  assert.equal(shared.public.published, false);
  assert.deepEqual(hidden(shared.public), []);
  assert.equal(findDisallowedRewardKey(shared.public), null);
  const journey = JSON.parse(readFileSync(join(store, "journey.json"), "utf8"));
  assert.equal(journey.proof.subject, "example-page");
  assert.equal(journey.proof.sequence, 1);
  assert.equal(journey.task.grossAtomic, "2000000");
});

test("owner labels on priors stay out of the public receipt", () => {
  const request = observationOnly(loadRequest());
  request.priors.ownerQa = true;
  const result = composeDelivery(request, { store: freshStore() });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.public.decisions[0].outcome, "useful_change");
  assert.deepEqual(hidden(result.public), []);
});

test("composed checks stay outside the production caller closure", {
  skip: !existsSync(join(root, ".git")) || !existsSync(join(root, "server/foundry/activation/private-control-pin.json")),
}, () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(Object.hasOwn(pkg.scripts, "test:composed-machine-delivery"), false);
  const pin = JSON.parse(readFileSync(join(root, "server/foundry/activation/private-control-pin.json"), "utf8"));
  assert.equal(pin.base, "4e24f9b5001aa5a527ca9ba3ecda98c97d4c7134");
  assert.equal(pin.receivedCallerClosures.length, 36);
  const names = Object.keys(pin.files);
  assert.equal(names.length, 1323);
  assert.equal(names.some((name) => name.startsWith("tools/")), false);
  const changed = spawnSync("git", ["diff", "--name-only", BASE], { cwd: root, encoding: "utf8" });
  assert.equal(changed.status, 0, changed.stderr);
  const bound = new Set([...names, "server/foundry/activation/private-control-pin.json", "package.json", "package-lock.json"]);
  const hits = changed.stdout.split("\n").filter((name) => bound.has(name));
  assert.deepEqual(hits, []);
});

test("emitted human assets match the qualified base", { skip: !existsSync(join(root, ".git")) || !existsSync(join(root, "client/dist")) }, () => {
  const diff = spawnSync("git", ["diff", "--exit-code", BASE, "--", "client/dist", "client/public", "client/src"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(diff.status, 0, diff.stdout || diff.stderr);
  const fee = spawnSync("git", ["diff", "--exit-code", BASE, "--", "vendor/hosted-wallet-market/src/fee.mjs"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(fee.status, 0, fee.stdout || fee.stderr);
  const sample = "client/dist/index.html";
  if (existsSync(join(root, sample))) {
    const current = execFileSync("git", ["hash-object", sample], { cwd: root, encoding: "utf8" }).trim();
    const base = execFileSync("git", ["rev-parse", `${BASE}:${sample}`], { cwd: root, encoding: "utf8" }).trim();
    assert.equal(current, base);
  }
});
