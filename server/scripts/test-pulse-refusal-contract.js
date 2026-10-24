import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { validateMcpOutcomes, refusalCoverage, mergeMcpOutcomes, refusalEvent } from "../lib/pulse-store/mcp-outcomes.js";
import { emptyDelta, deltaCanonicalDigest, deltaFromV2Snapshot, validateDelta } from "../lib/pulse-store/schema.js";
import { validateWalState } from "../lib/pulse-store/wal-schema.js";
import { createPulseStoreFromTransport } from "../lib/pulse-store/supabase-adapter.js";

const at = "2026-10-24T00:00:00.000Z", later = "2026-10-24T01:00:00.000Z";
const reason = "unattributed|_none|refusal_unsupported_protocol";
const old = () => ({ observedFrom: at, counts: { "unattributed|_none|protocol_error": 6 } });
const observation = () => ({ observedFrom: later, refusalObservedFrom: later, counts: { [reason]: 1, "unattributed|_none|protocol_error": 1 } });
const id = "d5950000-0000-4000-8000-000000000001";

test("unknown causes stay bounded; missing old dimensions stay unknown with exact old digests", () => {
  for (const input of [undefined, null, "raw-error-secret", "-32602", {}, [], 42]) assert.equal(refusalEvent(input), "refusal_unknown");
  assert.equal(refusalEvent("invalid_params"), "refusal_invalid_params");
  const delta = { ...emptyDelta(at), mcpOutcomes: old() };
  assert.equal(Object.hasOwn(validateDelta(delta).mcpOutcomes, "refusalObservedFrom"), false);
  const digest = deltaCanonicalDigest(delta);
  assert.equal(deltaCanonicalDigest(validateDelta(delta)), digest);
  const coverage = refusalCoverage(old());
  assert.equal(coverage.observedFrom, null); assert.equal(coverage.coverage, "unknown");
  assert.equal(coverage.withoutReason.unattributed, 6);
  const merged = mergeMcpOutcomes(old(), observation());
  assert.equal(merged.observedFrom, at); assert.equal(merged.refusalObservedFrom, later);
  assert.equal(refusalCoverage(merged).withoutReason.unattributed, 6, "the six historical causes are not reconstructed");
  assert.deepEqual(deltaFromV2Snapshot({ classificationSchemaVersion: 2, mcpToolCallsObservedFrom: at, mcpOutcomes: merged }).mcpOutcomes, validateMcpOutcomes(merged));
  const wal = validateWalState({ version: 2, pendingFlushes: [{ flushId: id, createdAt: at, delta }] });
  assert.equal(deltaCanonicalDigest(wal.pendingFlushes[0].delta), digest);
});

const badRefusalObservations = () => [
  { ...observation(), refusalObservedFrom: undefined },
  { ...observation(), refusalObservedFrom: null },
  { ...observation(), refusalObservedFrom: "2026-02-30T00:00:00.000Z" },
  { ...observation(), refusalObservedFrom: at },
  { ...observation(), refusalObservedFrom: "2026-10-24T01:00:00+00:00" },
  { ...observation(), counts: { "unattributed|_none|refusal_raw-error-secret": 1 } },
  { ...observation(), counts: { "unattributed|_none|refusal_unknown": -1 } },
  { ...observation(), counts: { "raw-source-secret|_none|refusal_unknown": 1 } },
  { ...observation(), counts: { "unattributed|raw-tool-secret|refusal_unknown": 1 } },
  { ...observation(), raw: "raw-error-secret" },
];

test("strict snapshot/WAL/transport reject unknown fields and unsafe refusal data", async () => {
  for (const value of badRefusalObservations()) {
    assert.throws(() => validateMcpOutcomes(value), /^Error: pulse_invalid_field:mcpOutcomes$/);
    assert.throws(() => validateWalState({ version: 2, pendingFlushes: [{ flushId: id, createdAt: at, delta: { ...emptyDelta(at), mcpOutcomes: value } }] }));
    const store = createPulseStoreFromTransport({ async rpc() { return { data: { ...emptyDelta(at), mcpOutcomes: value }, error: null }; } });
    await assert.rejects(store.readSnapshot(at), /^Error: pulse_invalid_field:mcpOutcomes$/);
  }
});

test("actual f629 readers accept old snapshots and queued WAL exactly, and refuse new fields even after drain", async t => {
  const dir = mkdtempSync(join(tmpdir(), "root5950-old-readers-")); t.after(() => rmSync(dir, { recursive: true, force: true }));
  // Retain the real old strict reader, rather than approximating its behavior.
  for (const name of ["schema.js", "mcp-outcomes.js", "wal-schema.js"]) {
    const result = spawnSync("git", ["show", `f629597d9e865bd6709d4b10d96a9905cc9ea3c3:server/lib/pulse-store/${name}`], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const text = result.stdout.replace(/(from\s+)["'](\.\.\/[^"']+)["']/g, (_, prefix, spec) => prefix + JSON.stringify(new URL(spec, new URL(`../lib/pulse-store/${name}`, import.meta.url)).href));
    writeFileSync(join(dir, name), text);
  }
  writeFileSync(join(dir, "package.json"), '{"type":"module"}');
  const reader = await import(pathToFileURL(join(dir, "schema.js")));
  const walReader = await import(pathToFileURL(join(dir, "wal-schema.js")));
  const delta = { ...emptyDelta(at), total: 123, humans: 27, mcpOutcomes: old() };
  assert.equal(reader.deltaCanonicalDigest(delta), deltaCanonicalDigest(delta));
  const queued = { version: 2, pendingFlushes: [{ flushId: id, createdAt: at, delta }] };
  assert.deepEqual(walReader.validateWalState(queued), validateWalState(queued));
  const snapshot = { classificationSchemaVersion: 2, mcpToolCallsObservedFrom: at, total: 123, humans: 27, mcpOutcomes: old() };
  assert.deepEqual(reader.deltaFromV2Snapshot(snapshot), deltaFromV2Snapshot(snapshot));
  const newDelta = { ...delta, mcpOutcomes: mergeMcpOutcomes(old(), observation()) };
  assert.throws(() => reader.validateDelta(newDelta), /pulse_invalid_field:mcpOutcomes/);
  assert.throws(() => walReader.validateWalState({ ...queued, pendingFlushes: [{ ...queued.pendingFlushes[0], delta: newDelta }] }), /pulse_invalid_field:mcpOutcomes/);
  assert.throws(() => reader.deltaFromV2Snapshot({ ...snapshot, mcpOutcomes: newDelta.mcpOutcomes }), /pulse_invalid_field:mcpOutcomes/);
  // A new binary still imports actual old/new file snapshots on fresh startup.
  for (const [index, outcomes] of [old(), newDelta.mcpOutcomes].entries()) {
    const file = join(dir, `snapshot-${index}.json`);
    writeFileSync(file, JSON.stringify({ ...snapshot, mcpOutcomes: outcomes }));
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", "const p=await import('./server/lib/pulse.js'); await p.waitForPulseHydration(); p.__pulseTestInternals().stopScheduledFlush(); console.log(JSON.stringify(p.pulseSnapshot()));"], { env: { ...process.env, PULSE_FILE: file, SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" }, encoding: "utf8" });
    assert.equal(child.status, 0, child.stderr);
    const result = JSON.parse(child.stdout);
    assert.equal(result.total, 123); assert.equal(result.humans, 27);
    assert.equal(result.knownGap.snapshotCorrupt, false);
    assert.equal(result.mcpProtocol.outcomes.refusals.withoutReason.unattributed, 6);
    assert.equal(result.mcpProtocol.outcomes.refusals.observedFrom, outcomes.refusalObservedFrom || null);
  }
});
