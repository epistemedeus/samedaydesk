import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ingestAdapter, PACK, FIX } from "./helpers.mjs";
import { toInteropV0 } from "../src/interop.mjs";

function walkJson(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkJson(p, acc);
    else if (name.endsWith(".json")) acc.push(p);
  }
  return acc;
}

test("PACK-EXPORT.patch exists, is > 10k bytes, contains bounty-intelligence", () => {
  const patchPath = join(PACK, "PACK-EXPORT.patch");
  assert.equal(existsSync(patchPath), true);
  const buf = readFileSync(patchPath);
  assert.ok(buf.byteLength > 10_000, `patch bytes ${buf.byteLength}`);
  assert.ok(buf.toString("utf8").includes("bounty-intelligence"));
});

test("interop.v0.json funding enum is unfunded|reserved|released|unknown", () => {
  const contract = JSON.parse(readFileSync(join(PACK, "contracts/interop.v0.json"), "utf8"));
  assert.deepEqual(contract.properties.funding.enum, ["unfunded", "reserved", "released", "unknown"]);
});

test("toInteropV0 on frantic fixture record has opaque taskId starting with bty_", async () => {
  const r = await ingestAdapter("frantic", "frantic-board.open.fixture.json");
  const rec = r.records.find((x) => x.source.nativeId === "130") || r.records[0];
  assert.ok(rec, "expected a frantic fixture record");
  const v0 = toInteropV0(rec);
  assert.equal(typeof v0.taskId, "string");
  assert.ok(v0.taskId.startsWith("bty_"), v0.taskId);
});

test("fixture JSON files all have dataLabel", () => {
  const files = walkJson(FIX);
  assert.ok(files.length > 0, "expected labelled fixture JSON");
  for (const f of files) {
    const data = JSON.parse(readFileSync(f, "utf8"));
    assert.equal(typeof data.dataLabel, "string", f);
    assert.ok(data.dataLabel.length > 0, f);
  }
});
