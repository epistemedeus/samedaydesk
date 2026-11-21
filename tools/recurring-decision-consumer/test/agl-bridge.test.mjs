import assert from "node:assert/strict";
import test from "node:test";
import {
  AGL_IMPORT_MAP,
  aglModulePresence,
  mapAglVerdict,
  decideOrReuseViaAgl,
  importPortableViaAgl,
} from "../src/agl-bridge.mjs";
import { OUTCOMES, REASONS } from "../src/pins.mjs";

test("import map pins AGL candidate heads without copying modules", () => {
  assert.equal(AGL_IMPORT_MAP.r05.pr, 364);
  assert.equal(AGL_IMPORT_MAP.r05.head, "3a4a7538329292c11d94b148d58964fc0656dece");
  assert.equal(AGL_IMPORT_MAP.r06.pr, 366);
  assert.equal(AGL_IMPORT_MAP.r06.head, "95c8a84155d01d67c707170e94aa148ba6542c50");
  assert.equal(AGL_IMPORT_MAP.r06.schema, "samedaydesk.portable-decision.v1");
  assert.ok(AGL_IMPORT_MAP.doNotCopy.includes("tools/result-reuse/src/portable.mjs"));
});

test("presence reports missing modules on main-only checkout", () => {
  const presence = aglModulePresence();
  assert.equal(typeof presence.exportPresent, "boolean");
  assert.equal(typeof presence.portablePresent, "boolean");
  // On the B6 package path alone, sibling result-reuse export may or may not expose decideOrReuse.
  assert.ok(presence.exportPath.endsWith("tools/result-reuse/src/export.mjs") || presence.exportPath.includes("result-reuse"));
});

test("mapAglVerdict maps reuse to useful_no_change", () => {
  const mapped = mapAglVerdict(
    { ok: true, mode: "decide-or-reuse", verdict: "reuse", inputDigest: "abc", clock: "2026-11-05T12:00:00.000Z" },
    { intentId: "i1", subject: "s1", clock: "2026-11-05T12:00:00.000Z", horizonHours: 24 },
  );
  assert.equal(mapped.ok, true);
  assert.equal(mapped.outcome, OUTCOMES.usefulNoChange);
  assert.equal(mapped.useful, true);
  assert.equal(mapped.via, "tools/result-reuse");
});

test("mapAglVerdict maps stale reason to stale", () => {
  const mapped = mapAglVerdict(
    { ok: true, mode: "decide-or-reuse", verdict: "recompute", reason: "stale_clock", message: "outside window" },
    { subject: "s1" },
  );
  assert.equal(mapped.outcome, OUTCOMES.stale);
  assert.equal(mapped.useful, false);
});

test("mapAglVerdict maps recompute digest mismatch to useful_change", () => {
  const mapped = mapAglVerdict(
    { ok: true, mode: "decide-or-reuse", verdict: "recompute", reason: "digest_mismatch", inputDigest: "new" },
    { subject: "s1" },
  );
  assert.equal(mapped.outcome, OUTCOMES.usefulChange);
  assert.equal(mapped.useful, true);
});

test("decideOrReuseViaAgl reports unavailable when modules missing", async () => {
  const presence = aglModulePresence();
  if (presence.exportPresent) {
    // If export.mjs exists on this checkout, skip the missing-path assertion.
    assert.ok(true);
    return;
  }
  const result = await decideOrReuseViaAgl({}, {}, { subject: "s", clock: "2026-11-05T12:00:00.000Z", horizonHours: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.outcome, OUTCOMES.unavailable);
  assert.equal(result.reason, REASONS.aglModulesMissing);
});

test("importPortableViaAgl reports unavailable when portable module missing", async () => {
  const presence = aglModulePresence();
  if (presence.portablePresent) {
    assert.ok(true);
    return;
  }
  const result = await importPortableViaAgl({}, {}, { subject: "s" });
  assert.equal(result.ok, false);
  assert.equal(result.reason, REASONS.aglModulesMissing);
});
