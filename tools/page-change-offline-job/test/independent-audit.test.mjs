import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { comparePageChange } from "../lib/compare.mjs";

const CLOCK = "2026-09-12T06:30:00.000Z";
const OBSERVED = "2026-09-12T06:29:59.000Z";
const bin = new URL("../bin/page-change.mjs", import.meta.url);

// Authored from the extract-batch contract, independently of the shipped
// customer/HTML fixtures and their extraction/normalization helpers.
function row(data, id = "a", overrides = {}) {
  return {
    id, source: `https://audit.example/${id}`, status: "success", data,
    notes: [], error: null, provenance: { completedAt: OBSERVED }, ...overrides,
  };
}

function batch(sources) {
  return {
    ok: true, product: "samedaydesk-extract-batch", schemaVersion: "samedaydesk.extract-batch.v0",
    quote: null, jobId: "independent-held-facts", jobStatus: "completed", stopReason: null,
    partial: false, sources, accounting: {}, costInputs: {}, charged: false, boundary: {},
  };
}

function rawBatch(data) {
  return JSON.stringify(batch([row("__RAW_FACTS__")])).replace('"__RAW_FACTS__"', data);
}

function cli(t, before, after, { fields = "openGraph", flags = [], jobLimits, clock = CLOCK } = {}) {
  const work = mkdtempSync(join(tmpdir(), "pc-independent-"));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  const beforePath = join(work, "before.json");
  const afterPath = join(work, "after.json");
  writeFileSync(beforePath, typeof before === "string" ? before : JSON.stringify(before));
  writeFileSync(afterPath, typeof after === "string" ? after : JSON.stringify(after));
  const jobPath = join(work, "job.json");
  writeFileSync(jobPath, JSON.stringify({ before: beforePath, after: afterPath, fields, clock, limits: jobLimits }));
  const args = jobLimits === undefined
    ? ["compare", "--before", beforePath, "--after", afterPath, "--fields", fields, "--clock", clock]
    : ["job", "--job", jobPath];
  const result = spawnSync(process.execPath, [bin.pathname, ...args, "--out-dir", join(work, "out"), ...flags], {
    encoding: "utf8", timeout: 10_000, maxBuffer: 1_048_576,
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=768" },
  });
  assert.equal(result.error, undefined, result.error?.message);
  if (result.status === 0) {
    const report = JSON.parse(result.stdout).report;
    assert.deepEqual(JSON.parse(readFileSync(join(work, "out/page-change.json"), "utf8")).report, report);
    return { ...result, report, markdown: readFileSync(join(work, "out/page-change.md"), "utf8") };
  }
  return { ...result, errorBody: JSON.parse(result.stderr.split("\n")[0]) };
}

const factPairs = [
  { name: "fractional price step", before: '{"openGraph":{"price":0.1}}', after: '{"openGraph":{"price":0.10000000000000002}}', verdict: "changed" },
  { name: "equivalent numeric spellings and key order", before: '{"openGraph":{"price":19.9900,"count":1e2}}', after: '{"openGraph":{"count":100,"price":1.999e1}}', verdict: "unchanged" },
  { name: "canonical Unicode title", before: '{"title":"A\u030angstro\u0308m"}', after: '{"title":"Ångström"}', fields: "title", verdict: "unchanged" },
  { name: "Unicode compatibility remains distinct", before: '{"title":"Ａ"}', after: '{"title":"A"}', fields: "title", verdict: "changed" },
  { name: "non-title Unicode remains literal", before: '{"text":"e\u0301"}', after: '{"text":"é"}', fields: "text", verdict: "changed" },
  { name: "nested explicit null removal", before: '{"openGraph":{"availability":null}}', after: '{"openGraph":{}}', verdict: "changed", op: "remove", path: "/openGraph/availability" },
  { name: "literal prototype-named metadata removal", before: '{"openGraph":{"__proto__":{"availability":"in_stock"}}}', after: '{"openGraph":{}}', verdict: "changed", op: "remove", path: "/openGraph/__proto__" },
  { name: "escaped metadata identity", before: '{"openGraph":{"a/b~c":"present"}}', after: '{"openGraph":{}}', verdict: "changed", op: "remove", path: "/openGraph/a~1b~0c" },
  { name: "mixed-type array reorder", before: '{"openGraph":{"items":[1,"1",null,false,{"a":2}]}}', after: '{"openGraph":{"items":[false,{"a":2},"1",1,null]}}', verdict: "reordered" },
  { name: "mixed-type array value change", before: '{"openGraph":{"items":[1,"1",null]}}', after: '{"openGraph":{"items":["1","1",null]}}', verdict: "changed" },
];

for (const pair of factPairs) {
  test(`independent CLI fact pair: ${pair.name}`, (t) => {
    const result = cli(t, rawBatch(pair.before), rawBatch(pair.after), { fields: pair.fields });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.report.verdict, pair.verdict);
    assert.equal(result.report.claims.complete, true);
    if (pair.path) {
      const change = result.report.changes.find((item) => item.path === pair.path);
      assert.equal(change?.op, pair.op);
      assert.equal(Object.hasOwn(change, "after"), false);
    }
  });
}

for (const literal of ["0.10000000000000001", "9007199254740993", "1e-400", "1e400"]) {
  test(`CLI refuses numeric information loss: ${literal}`, (t) => {
    const rounded = Number.isFinite(Number(literal)) ? Number(literal) : null;
    const result = cli(t, rawBatch(JSON.stringify({ openGraph: { price: rounded } })), rawBatch(`{"openGraph":{"price":${literal}}}`));
    assert.equal(result.status, 2, "lossy JSON numbers must not produce complete rounded comparisons");
    assert.equal(result.errorBody.code, "input_precision");
  });
}

test("partial row and provider error cannot prove complete/current despite top-level success", (t) => {
  for (const overrides of [{ status: "partial" }, { error: { code: "provider_timeout", message: "held data may be stale" } }]) {
    const before = batch([row({ title: "held" })]);
    const after = batch([row({ title: "held" }, "a", overrides)]);
    const result = cli(t, before, after, { fields: "title", flags: ["--max-stale-ms", "1000"] });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.report.verdict, "incomplete");
    assert.equal(result.report.claims.complete, false);
    assert.equal(result.report.claims.current, false);
    assert.equal(result.report.claims.noChangeProven, false);
    assert.ok(result.report.coverageUnknown.some((item) => item.side === "after" && item.sourceKey === "https://audit.example/a"));
  }
});

test("missing selected metadata is unknown coverage while nested loss is explicit", (t) => {
  const result = cli(t, batch([row({ openGraph: { price: 7.25 } })]), batch([row({})]));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.report.verdict, "incomplete");
  assert.equal(result.report.claims.noChangeProven, false);
  assert.deepEqual(result.report.changes, []);
});

test("partial provider coverage preserves witnessed changes without certifying completeness", (t) => {
  const before = batch([row({ title: "old" }), row({ title: "held" }, "b")]);
  const after = batch([
    row({ title: "new" }),
    row({ title: "held" }, "b", { status: "partial", error: { code: "provider_timeout" } }),
  ]);
  const result = cli(t, before, after, { fields: "title", flags: ["--max-stale-ms", "1000"] });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.report.verdict, "changed");
  assert.equal(result.report.claims.complete, false);
  assert.equal(result.report.claims.current, false);
  assert.equal(result.report.changes[0].sourceKey, "https://audit.example/a");
  assert.ok(result.report.coverageUnknown.some((item) => item.code === "merchant_source_error"));
});

test("unselected transport metadata is noise for selected fact comparison", (t) => {
  const before = batch([row({ title: "same", openGraph: { revision: 1 } })]);
  const after = batch([row({ title: "same", openGraph: { revision: 2 } }, "a", {
    notes: ["cache diagnostic changed"], provenance: { completedAt: "2026-09-12T06:30:00Z" },
  })]);
  after.jobId = "a-different-observation";
  const result = cli(t, before, after, { fields: "title" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.report.verdict, "unchanged");
  assert.equal(result.report.claims.complete, true);
  assert.equal(result.report.claims.fresh, false);
});

test("a source reorder omitted at the exact change cap makes the CLI report incomplete", (t) => {
  const before = batch([row({ title: "old" }), row({ title: "same" }, "b")]);
  const after = batch([row({ title: "same" }, "b"), row({ title: "new" })]);
  const result = cli(t, before, after, { fields: "title", flags: ["--max-changes", "1"] });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.report.verdict, "changed");
  assert.equal(result.report.changes.length, 1);
  assert.equal(result.report.claims.complete, false);
  assert.ok(result.report.snapshot.limitsHit.includes("maxChanges"));
});

test("pure source reorder at zero change cap cannot prove no change", (t) => {
  const a = row({ title: "a" });
  const b = row({ title: "b" }, "b");
  const result = cli(t, batch([a, b]), batch([b, a]), { fields: "title", flags: ["--max-changes", "0"] });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.report.verdict, "incomplete");
  assert.equal(result.report.claims.noChangeProven, false);
  assert.ok(result.report.snapshot.limitsHit.includes("maxChanges"));
});

test("exact change cap plus equal siblings is complete", (t) => {
  const before = batch([row({ openGraph: { a: 1, z: "same" } })]);
  const after = batch([row({ openGraph: { a: 2, z: "same" } })]);
  const result = cli(t, before, after, { flags: ["--max-changes", "1"] });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.report.claims.complete, true);
  assert.deepEqual(result.report.snapshot.limitsHit, []);
});

test("equal deep facts and arrays cannot skip advertised analysis bounds", (t) => {
  for (const [data, flags, limit] of [
    [{ openGraph: { a: { b: { c: 1 } } } }, ["--max-json-depth", "2"], "maxJsonDepth"],
    [{ openGraph: { values: [1, 2, 3, 4, 5] } }, ["--max-json-nodes", "3"], "maxJsonNodes"],
  ]) {
    const result = cli(t, batch([row(data)]), batch([row(data)]), { flags });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.report.verdict, "incomplete");
    assert.equal(result.report.claims.noChangeProven, false);
    assert.ok(result.report.snapshot.limitsHit.includes(limit));
  }
});

test("job-file limits receive the same validation as CLI flags", (t) => {
  for (const limits of [{ maxStaleMs: "unlimited" }, { maxJsonNodes: -1 }, { maxSources: 1.5 }, { maxChanges: null }]) {
    const input = batch([row({ openGraph: {} })]);
    const result = cli(t, input, input, { jobLimits: limits });
    assert.equal(result.status, 2);
    assert.equal(result.errorBody.code, "usage");
  }
});

test("mixed-type replacements retain distinguishable evidence", (t) => {
  const result = cli(t, rawBatch('{"openGraph":{"price":"1"}}'), rawBatch('{"openGraph":{"price":1}}'));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.report.verdict, "changed");
  const change = result.report.changes[0];
  assert.equal(change.beforeType, "string");
  assert.equal(change.afterType, "number");
  assert.match(result.markdown, /string.*number/);
});

test("invalid and future observation clocks never imply current data", (t) => {
  for (const [completedAt, freshness] of [
    ["2026-02-30T06:29:59.000Z", "unknown"],
    ["2026-09-12T24:00:00.000Z", "unknown"],
    ["2026-09-12T06:30:00.001Z", "inverted"],
    ["2026-09-12T06:29:58.999Z", "stale"],
    [null, "unknown"],
  ]) {
    const input = batch([row({ title: "held" })]);
    const after = batch([row({ title: "held" }, "a", { provenance: { completedAt } })]);
    const result = cli(t, input, after, { fields: "title", flags: ["--max-stale-ms", "1000"] });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.report.freshness, freshness);
    assert.equal(result.report.claims.current, false);
  }
});

test("snapshot timestamp uses chronological order across optional milliseconds", (t) => {
  const input = batch([
    row({ title: "a" }, "a", { provenance: { completedAt: "2026-09-12T06:29:59Z" } }),
    row({ title: "b" }, "b", { provenance: { completedAt: "2026-09-12T06:29:59.999Z" } }),
  ]);
  const result = cli(t, input, input, { fields: "title", flags: ["--max-stale-ms", "1000"] });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.report.snapshot.after.observedAt, "2026-09-12T06:29:59.999Z");
  assert.equal(result.report.claims.current, true);
});

test("source reorder evidence obeys the display excerpt byte bound", (t) => {
  const a = row({ title: "a" });
  const b = row({ title: "b" }, "b");
  const result = cli(t, batch([a, b]), batch([b, a]), { fields: "title", flags: ["--max-excerpt-bytes", "5"] });
  assert.equal(result.status, 0, result.stderr);
  const change = result.report.changes[0];
  assert.equal(result.report.verdict, "reordered");
  assert.equal(result.report.claims.complete, true);
  assert.ok(Buffer.byteLength(change.beforeEvidence) <= 5);
  assert.ok(Buffer.byteLength(change.afterEvidence) <= 5);
  assert.equal(change.evidenceTruncated, true);
});

test("UTF-8 excerpt limits preserve whole code points", (t) => {
  const result = cli(t, rawBatch('{"text":"🎉 original"}'), rawBatch('{"text":"🎈 revised"}'), { fields: "text", flags: ["--max-excerpt-bytes", "3"] });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.report.changes[0].beforeEvidence, "");
  assert.equal(result.report.changes[0].afterEvidence, "");
  assert.equal(result.report.claims.complete, true);
});

test("in-memory library inputs obey maxBytes and reject non-finite numbers", async () => {
  const input = batch([row({ openGraph: { price: 19.99 } })]);
  const options = { beforeJson: input, afterJson: input, fields: ["openGraph"], clock: CLOCK };
  await assert.rejects(() => comparePageChange({ ...options, limits: { maxBytes: 1 } }), { code: "input_bounds" });
  for (const price of [NaN, Infinity, -Infinity]) {
    await assert.rejects(() => comparePageChange({ ...options, afterJson: batch([row({ openGraph: { price } })]) }), { code: "input_precision" });
  }
});

test("invalid job clocks refuse, valid leap day and year zero are accepted", (t) => {
  const input = batch([row({ title: "held" })]);
  for (const clock of ["2025-02-29T00:00:00Z", "2026-04-31T00:00:00Z", "2026-09-12T24:00:00Z", "2026-09-12T00:00:60Z", "2026-09-12T00:00:00+00:00"]) {
    const result = cli(t, input, input, { fields: "title", clock });
    assert.equal(result.status, 2);
    assert.equal(result.errorBody.code, "clock_required");
  }
  for (const clock of ["2024-02-29T00:00:00Z", "0000-02-29T00:00:00.000Z"]) {
    assert.equal(cli(t, input, input, { fields: "title", clock }).status, 0);
  }
});

test("selected counter differences describe held content without business-importance claims", (t) => {
  const result = cli(t, rawBatch('{"text":"Visitors: 10"}'), rawBatch('{"text":"Visitors: 11"}'), { fields: "text" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.report.verdict, "changed");
  assert.equal(result.report.claims.fresh, false);
  assert.doesNotMatch(result.markdown, /business (?:event|importance|impact) (?:proven|detected)/i);
});

test("bounded deterministic mixed-JSON metamorphic audit (96 pairs, seed 0x34a57a)", async () => {
  let seed = 0x34a57a;
  const random = (n) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  const atoms = [null, false, true, 0, -3, 0.1, 19.99, "", "0", "false", "é", "e\u0301", "a\0b"];
  function value(depth = 0) {
    if (depth === 3 || random(3) === 0) return atoms[random(atoms.length)];
    if (random(2)) return Array.from({ length: random(4) }, () => value(depth + 1));
    return Object.fromEntries(Array.from({ length: random(4) }, (_, i) => [["__proto__", "a/b", "~", ""][i], value(depth + 1)]));
  }
  function reverseKeys(input) {
    if (Array.isArray(input)) return input.map(reverseKeys);
    if (input !== null && typeof input === "object") return Object.fromEntries(Object.entries(input).reverse().map(([k, v]) => [k, reverseKeys(v)]));
    return input;
  }
  const compare = (a, b) => comparePageChange({ beforeJson: batch([row({ openGraph: a })]), afterJson: batch([row({ openGraph: b })]), fields: ["openGraph"], clock: CLOCK });
  for (let i = 0; i < 96; i += 1) {
    const a = value();
    const b = value();
    const self = await compare(a, structuredClone(a));
    assert.equal(self.verdict, "unchanged", `self ${i}`);
    assert.equal(self.claims.complete, true);
    const keys = await compare(a, reverseKeys(a));
    assert.equal(keys.verdict, "unchanged", `key order ${i}`);
    const forward = await compare(a, b);
    const backward = await compare(b, a);
    assert.equal(forward.verdict, backward.verdict, `reversal ${i}`);
    assert.equal(forward.claims.complete, backward.claims.complete);
    assert.equal(forward.provenance.digestSha256, (await compare(a, b)).provenance.digestSha256, `repeat ${i}`);
    // Independent strict JSON equality oracle; no engine canonicalizer is used.
    const equal = (() => { try { assert.deepEqual(a, b); return true; } catch { return false; } })();
    assert.equal(forward.verdict === "unchanged", equal, `equality ${i}`);
    const inverse = forward.changes.map((change) => ({
      path: change.path, op: change.op === "add" ? "remove" : change.op === "remove" ? "add" : change.op,
      before: change.after, after: change.before,
    }));
    assert.deepEqual(backward.changes.map(({ path, op, before, after }) => ({ path, op, before, after })), inverse, `evidence reversal ${i}`);
  }
});
