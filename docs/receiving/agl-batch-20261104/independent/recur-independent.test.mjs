// Independent cases for the received RECUR pin. This file does not edit that pin.
import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const pin = process.env.AGL_RECUR_ROOT;
if (!pin) throw new Error("AGL_RECUR_ROOT is required");

const { decideOrReuse, exportReuse, previewReuse } = await import(
  pathToFileURL(join(pin, "tools/result-reuse/src/export.mjs")).href
);

const CLOCK = "2026-11-04T12:00:00.000Z";
const HORIZON_HOURS = 24;
const TASK = "receiving-desk-note";
const SUBJECT = "receiving-desk-note-result";

function freshResult(title, hashNibble = "cd") {
  return {
    schema: "pilot.task-commons.page-change-result.v1",
    publicSafe: true,
    url: "https://example.com/receiving/desk-note",
    status: 200,
    fetchedAt: CLOCK,
    contentHash: `sha256:${hashNibble.repeat(64)}`,
    bytes: 128,
    title,
    credentials: false,
    liveParticipant: false,
    payment: false,
  };
}

function options(extra = {}) {
  return {
    taskId: TASK,
    subject: SUBJECT,
    sequence: 1,
    clock: CLOCK,
    horizonHours: HORIZON_HOURS,
    optIn: true,
    ...extra,
  };
}

function iso(ms) {
  return new Date(ms).toISOString();
}

const startMs = Date.parse(CLOCK);
const fresh = freshResult("Receiving desk note 20261104");
const preview = previewReuse(fresh, options());
assert.equal(preview.ok, true, preview.message);
const saved = preview.observation;
const exported = exportReuse(fresh, options());
assert.equal(exported.ok, true, exported.message);

test("a fresh saved observation, not loaded from fixtures, reuses on the same public inputs", () => {
  const fromPreview = decideOrReuse(saved, fresh, options());
  const fromExport = decideOrReuse(exported, fresh, options());
  assert.equal(fromPreview.ok, true);
  assert.equal(fromPreview.verdict, "reuse");
  assert.equal(fromPreview.inputDigest, saved.source.version);
  assert.equal(fromPreview.inputDigest.startsWith("sha256:"), true);
  assert.equal(fromPreview.sourceUri, "https://example.com/receiving/desk-note");
  assert.equal(fromPreview.revision, "rev_1");
  assert.equal(fromPreview.clock, CLOCK);
  assert.equal(fromPreview.decision.observationId, saved.observationId);
  assert.equal(fromExport.verdict, "reuse");
  assert.equal(fromExport.inputDigest, fromPreview.inputDigest);
  assert.equal(fromPreview.liveMetric.distinctLaterAcceptedTasksTakingReuse, null);
  assert.equal(fromPreview.liveMetric.recomputeCostAvoidedNetOfUpkeep, "costs_unknown");
  assert.equal(fromPreview.publicSafeCertified, false);
  assert.equal(JSON.stringify(saved).includes("fixtures/"), false);
});

test("an unprojected annotation does not change the fresh observation digest", () => {
  const annotated = { ...fresh, annotation: "ordinary public margin note" };
  const verdict = decideOrReuse(saved, annotated, options());
  assert.equal(verdict.verdict, "reuse");
  assert.equal(verdict.inputDigest, saved.source.version);
});

test("a 24 hour horizon boundary reuses, and one millisecond past it recomputes", () => {
  const onWindow = decideOrReuse(saved, fresh, options({
    clock: iso(startMs + HORIZON_HOURS * 3_600_000),
  }));
  assert.equal(onWindow.verdict, "reuse");
  assert.equal(onWindow.recipeWindow.stale, false);
  assert.equal(onWindow.clock, CLOCK);

  const justInside = decideOrReuse(saved, fresh, options({
    clock: iso(startMs + HORIZON_HOURS * 3_600_000 - 1),
  }));
  assert.equal(justInside.verdict, "reuse");

  const past = decideOrReuse(saved, fresh, options({
    clock: iso(startMs + HORIZON_HOURS * 3_600_000 + 1),
  }));
  assert.equal(past.ok, true);
  assert.equal(past.verdict, "recompute");
  assert.equal(past.reason, "stale_clock");
  assert.equal(past.recipeWindow.stale, true);
  assert.equal(past.decision, undefined);

  const zeroSame = decideOrReuse(saved, fresh, options({ horizonHours: 0, clock: CLOCK }));
  assert.equal(zeroSame.verdict, "reuse");
  const zeroPast = decideOrReuse(saved, fresh, options({
    horizonHours: 0,
    clock: iso(startMs + 1),
  }));
  assert.equal(zeroPast.verdict, "recompute");
  assert.equal(zeroPast.reason, "stale_clock");
});

test("a title-only digest change recomputes, and restoring the title reuses again", () => {
  const changed = freshResult("Receiving desk note revised");
  const miss = decideOrReuse(saved, changed, options());
  assert.equal(miss.ok, true);
  assert.equal(miss.verdict, "recompute");
  assert.equal(miss.reason, "digest_mismatch");
  assert.notEqual(miss.inputDigest, saved.source.version);
  assert.equal(miss.savedInputDigest, saved.source.version);
  assert.equal(JSON.stringify(miss).includes("Receiving desk note revised"), false);

  const restored = decideOrReuse(saved, fresh, options());
  assert.equal(restored.verdict, "reuse");
  assert.equal(restored.inputDigest, saved.source.version);
});

test("opt-in withdrawal recomputes, and a later opt-in reuses the same fresh decision", () => {
  const withdrawn = decideOrReuse(saved, fresh, options({
    optIn: false,
    optInWithdrawn: true,
  }));
  assert.equal(withdrawn.ok, true);
  assert.equal(withdrawn.verdict, "recompute");
  assert.equal(withdrawn.reason, "opt_in_withdrawn");
  assert.equal(withdrawn.decision, undefined);
  assert.match(withdrawn.message, /withdrawn/);

  const conflict = decideOrReuse(saved, fresh, options({
    optIn: true,
    optInWithdrawn: true,
  }));
  assert.equal(conflict.ok, false);
  assert.notEqual(conflict.verdict, "reuse");

  const missing = decideOrReuse(saved, fresh, options({ optIn: undefined }));
  assert.equal(missing.ok, false);
  assert.match(missing.message, /opt-in/);

  const restored = decideOrReuse(saved, fresh, options({ optIn: true }));
  assert.equal(restored.verdict, "reuse");
  assert.equal(restored.inputDigest, saved.source.version);
});

test("oversize public input and an oversize saved decision do not reuse", () => {
  const wideTitle = freshResult("q".repeat(70_000));
  const wide = decideOrReuse(saved, wideTitle, options());
  assert.equal(wide.ok, false);
  assert.match(wide.message, /65536/);
  assert.notEqual(wide.verdict, "reuse");

  const payloadTitle = freshResult("p".repeat(40_000));
  const payload = decideOrReuse(saved, payloadTitle, options());
  assert.equal(payload.ok, false);
  assert.match(payload.message, /32768/);
  assert.notEqual(payload.verdict, "reuse");

  const hugeSaved = { blob: "z".repeat(1_048_577) };
  const capped = decideOrReuse(hugeSaved, fresh, options());
  assert.equal(capped.ok, false);
  assert.match(capped.message, /1048576/);
  assert.notEqual(capped.verdict, "reuse");

  const stillGood = decideOrReuse(saved, fresh, options());
  assert.equal(stillGood.verdict, "reuse");
});

test("a missing recipe window and a malformed saved record fail closed", () => {
  const noWindow = decideOrReuse(saved, fresh, options({ horizonHours: undefined }));
  assert.equal(noWindow.ok, false);
  assert.match(noWindow.message, /recipe window/);
  assert.notEqual(noWindow.verdict, "reuse");

  const malformed = decideOrReuse({ schema: "not-an-observation" }, fresh, options());
  assert.equal(malformed.ok, false);
  assert.match(malformed.message, /neomorphic\.task-memory\.observation\.v1/);
  assert.notEqual(malformed.verdict, "reuse");
});
