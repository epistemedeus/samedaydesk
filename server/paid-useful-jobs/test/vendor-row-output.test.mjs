import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const own = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(own, "../..");
const pub = join(repo, "client/public/for-agents/useful-jobs");
const corpus = join(own, "fixtures/vendor-field");
const root = mkdtempSync(join(tmpdir(), "sds-vendor-cold-"));
after(() => rmSync(root, { recursive: true, force: true }));
const hash = (data) => createHash("sha256").update(data).digest("hex");
function extract(version) {
  const pin = JSON.parse(readFileSync(join(pub, "useful-jobs-" + version + ".sha256.json")));
  const archive = join(pub, pin.archive || "useful-jobs-" + version + ".tar.gz");
  const bytes = readFileSync(archive);
  assert.equal(bytes.length, pin.bytes);
  assert.equal(hash(bytes), pin.sha256);
  const r = spawnSync("tar", ["-xzf", archive, "-C", root], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return join(root, "useful-jobs-" + version);
}
const kit = extract("1.4.1");
function run(before, after, selectedKit = kit) {
  const work = mkdtempSync(join(root, "run-"));
  const beforePath = join(work, "before.json");
  const afterPath = join(work, "after.json");
  writeFileSync(beforePath, JSON.stringify(before));
  writeFileSync(afterPath, JSON.stringify(after));
  const out = join(work, "out");
  const proc = spawnSync(process.execPath, [join(selectedKit, "bin/useful-jobs.mjs"), "run", "vendor-budget-impact", "--before", beforePath, "--after", afterPath, "--out-dir", out],
    { cwd: work, encoding: "utf8", timeout: 60_000 });
  let receipt;
  try { receipt = JSON.parse(proc.stdout); } catch {}
  let artifact, markdown;
  if (proc.status === 0) {
    artifact = JSON.parse(readFileSync(join(out, "budget-impact.json")));
    markdown = readFileSync(join(out, "budget-impact.md"), "utf8");
  }
  return { proc, receipt, artifact, markdown };
}
function pair(id) {
  const read = (file) => JSON.parse(readFileSync(join(corpus, id, file)));
  return { before: read("before.json"), after: read("after.json") };
}
function good(result, status) {
  assert.equal(result.proc.status, 0, result.proc.stderr + result.proc.stdout);
  assert.equal(result.artifact.status, status);
  assert.equal(result.artifact.purchaseAuthority, false);
  assert.equal(result.artifact.scope.billCalculation, false);
  assert.equal(result.artifact.scope.unitsConverted, false);
  assert.equal(result.artifact.scope.liveQuote, false);
  assert.equal(result.artifact.scope.sourceCoverageVerified, false);
}
const ids = [
  ["openai-gpt35-turbo-20230613-20240125", "actionable", "review-price-field", 2],
  ["openai-embedding-3-small-added-20240125", "actionable", "review-added-price-field", 1],
  ["anthropic-sonnet35-prompt-cache-20241217", "actionable", "review-added-price-field", 2],
  ["cloudflare-workers-r2-classA-added", "actionable", "review-added-price-field", 1],
  ["anthropic-haiku3-unchanged-20240304-20241217", "informational", "no-budget-delta", 1],
  ["control-unit-label-unconverted", "partial", "normalize-unit-before-budgeting", 1],
];
for (const [id, status, kind, count] of ids) test("cold CLI field pair: " + id, () => {
  const p = pair(id);
  const result = run(p.before, p.after);
  good(result, status);
  assert.equal(result.artifact.actions.filter((a) => a.kind === kind).length, count);
  if (status !== "informational") assert.ok(!result.artifact.actions.some((a) => a.kind === "no-budget-delta"));
  if (kind === "review-added-price-field") {
    const beforeFields = new Set(p.before.rows.map((r) => r.field));
    for (const row of p.after.rows.filter((r) => !beforeFields.has(r.field))) {
      const action = result.artifact.actions.find((a) => a.fieldKey === row.field);
      assert.equal(action.afterValue, row.value);
      assert.equal(action.unit, row.unit);
      assert.equal(action.delta, undefined);
      assert.ok(result.markdown.includes(String(row.value)));
    }
  }
});
test("released 1.4.0 regression control actually reproduces the added-row defect", () => {
  const p = pair("openai-embedding-3-small-added-20240125");
  const result = run(p.before, p.after, extract("1.4.0"));
  assert.equal(result.proc.status, 0);
  assert.equal(result.artifact.status, "actionable");
  assert.equal(result.artifact.underlying.counts.added, 1);
  assert.equal(result.artifact.actions[0].kind, "no-budget-delta");
});
test("same-unit raw values and arithmetic appear in JSON and Markdown, not a bill", () => {
  const p = pair("openai-gpt35-turbo-20230613-20240125");
  const result = run(p.before, p.after);
  good(result, "actionable");
  for (const before of p.before.rows) {
    const after = p.after.rows.find((r) => r.field === before.field);
    const action = result.artifact.actions.find((a) => a.fieldKey === before.field);
    assert.equal(action.beforeValue, before.value);
    assert.equal(action.afterValue, after.value);
    assert.equal(action.unit, before.unit);
    assert.ok(Math.abs(action.delta - (after.value - before.value)) < 1e-12);
    assert.ok(result.markdown.includes(String(before.value)));
    assert.ok(result.markdown.includes(String(after.value)));
  }
  assert.match(result.markdown, /No live quote, unit conversion, bill calculation/);
});
test("removed row retains its before value with no savings conclusion", () => {
  const p = pair("openai-embedding-3-small-added-20240125");
  const result = run(p.after, p.before);
  good(result, "actionable");
  const action = result.artifact.actions.find((a) => a.kind === "review-removed-price-field");
  assert.equal(action.fieldKey, "text-embedding-3-small");
  assert.equal(action.beforeValue, 0.00002);
  assert.equal(action.unit, "USD/1K-tokens");
  assert.equal(action.delta, undefined);
  assert.match(action.note, /does not establish retirement/);
  assert.match(result.artifact.summary, /removed=1/);
});
test("mixed add/remove/change names all three, including zero-valued fields", () => {
  const result = run({ rows: [{ field: "retired-from-snapshot", value: 0, unit: "USD/request" }, { field: "kept", value: 2, unit: "USD/request" }] },
    { rows: [{ field: "added-to-snapshot", value: 0, unit: "USD/request" }, { field: "kept", value: 1, unit: "USD/request" }] });
  good(result, "actionable");
  assert.deepEqual(new Set(result.artifact.actions.map((a) => a.kind)), new Set(["review-price-field", "review-added-price-field", "review-removed-price-field"]));
  assert.equal(result.artifact.actions.find((a) => a.kind === "review-added-price-field").afterValue, 0);
  assert.equal(result.artifact.actions.find((a) => a.kind === "review-removed-price-field").beforeValue, 0);
});
test("unit change with changed number remains partial with no numerical comparison", () => {
  const result = run({ rows: [{ field: "input", value: 0.001, unit: "USD/1K-tokens" }] }, { rows: [{ field: "input", value: 1, unit: "USD/1M-tokens" }] });
  good(result, "partial");
  assert.ok(result.artifact.actions.every((a) => a.delta === undefined));
  assert.ok(!result.artifact.actions.some((a) => a.kind === "review-price-field"));
});
for (const [name, row] of [
  ["missing field", { value: 1, unit: "USD/request" }],
  ["missing value", { field: "input", unit: "USD/request" }],
  ["missing unit", { field: "input", value: 1 }],
  ["blank unit", { field: "input", value: 1, unit: " " }],
  ["nonnumeric value", { field: "input", value: "1", unit: "USD/request" }],
]) test("cold CLI refuses " + name, () => {
  const result = run({ rows: [{ field: "input", value: 1, unit: "USD/request" }] }, { rows: [row] });
  assert.notEqual(result.proc.status, 0);
  assert.equal(result.receipt.code, "input-schema-mismatch");
  assert.equal(result.artifact, undefined);
});
test("archive wrapper and caller contract equal authoritative source bytes", () => {
  const pin = JSON.parse(readFileSync(join(pub, "useful-jobs-1.4.1.sha256.json")));
  for (const file of ["apps/vendor-budget-impact/cli.mjs", "apps/vendor-budget-impact/CALLER.md"]) {
    const source = readFileSync(join(own, "release", file));
    assert.deepEqual(readFileSync(join(kit, file)), source);
    assert.equal(pin.sourceFiles["server/paid-useful-jobs/release/" + file], hash(source));
  }
});
test("all old archive and pin mirrors stay immutable to recorded base", () => {
  const current = JSON.parse(readFileSync(join(pub, "useful-jobs-1.4.1.sha256.json")));
  assert.equal(current.immutable.length, 5);
  for (const pin of current.immutable) {
    const bytes = readFileSync(join(pub, pin.archive));
    assert.equal(bytes.length, pin.bytes);
    assert.equal(hash(bytes), pin.sha256);
    assert.deepEqual(bytes, readFileSync(join(repo, "client/public/kit", pin.archive)));
  }
});
test("public discovery, catalog, site card, and archive agree", () => {
  const read = (p) => JSON.parse(readFileSync(join(repo, p)));
  const discovery = read("client/public/discovery/useful-jobs.json");
  const card = read("client/src/data/usefulJobsKit.json");
  const pin = read("client/public/for-agents/useful-jobs/useful-jobs-1.4.1.sha256.json");
  for (const metadata of [discovery, card]) {
    assert.equal(metadata.version, "1.4.1");
    assert.equal(metadata.sha256, pin.sha256);
    assert.equal(metadata.bytes, pin.bytes);
  }
  assert.deepEqual(read("client/public/for-agents/useful-jobs/catalog.json"), JSON.parse(readFileSync(join(kit, "catalog.json"))));
  assert.deepEqual(read("client/public/for-agents/useful-jobs/jobs-outcomes.json"), JSON.parse(readFileSync(join(kit, "jobs-outcomes.json"))));
});
