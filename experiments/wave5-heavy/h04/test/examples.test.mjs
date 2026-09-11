import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { loadCatalog } from "../src/catalog.mjs";
import {
  EXPECTED_SHAS,
  FALLBACK_PINS,
  SHA_RE,
  loadEngines,
} from "../src/engines.mjs";
import { FAMILIES, H04_ROOT } from "../src/paths.mjs";

const SDS52_SHA = "aeef964fa188443078958d9d6d393afae1d542ee";
const W4_SHAS = Object.freeze({
  "w4-json-schema-webhook-drift": "94c7bfdfeaa99f5e70f341504df3051cc7717f91",
  "w4-lockfile-pin-delta": "e81efc8ab71b1bde88eca743d297149e61bbb6f2",
  "w4-route-table-diff": "7387eb677abd442dfab9081cb0ad95451fd2a762",
  "w4-page-change-offline-job": "91b57334818ecd7940cb854e9864f3b1749d1d1d",
});
const REQUIRED_EXAMPLE_FIELDS = ["id", "family", "kind", "engines", "inputs", "changedFact"];

test("pins match SDS52 aeef964fa188443078958d9d6d393afae1d542ee and W4 SHAs", () => {
  assert.equal(EXPECTED_SHAS["sds52-paid-useful-jobs"], SDS52_SHA);
  assert.equal(EXPECTED_SHAS["sds52-paid-useful-jobs"].length, 40);
  assert.match(EXPECTED_SHAS["sds52-paid-useful-jobs"], SHA_RE);
  for (const [id, sha] of Object.entries(W4_SHAS)) {
    assert.equal(EXPECTED_SHAS[id], sha);
    assert.match(sha, SHA_RE);
    assert.equal(sha.length, 40);
  }
  for (const pin of FALLBACK_PINS) {
    assert.match(pin.sha, SHA_RE);
    assert.equal(pin.sha, EXPECTED_SHAS[pin.id]);
  }
  const { engines } = loadEngines();
  const sds52 = engines.find((e) => e.id === "sds52-paid-useful-jobs");
  assert.ok(sds52, "sds52-paid-useful-jobs pin missing");
  assert.equal(sds52.sha, SDS52_SHA);
  for (const [id, sha] of Object.entries(W4_SHAS)) {
    const engine = engines.find((e) => e.id === id);
    assert.ok(engine, `missing engine ${id}`);
    assert.equal(engine.sha, sha);
  }
  const pinsFile = join(H04_ROOT, "fixtures", "engine-pins.json");
  if (existsSync(pinsFile)) {
    const pins = JSON.parse(readFileSync(pinsFile, "utf8"));
    assert.equal(pins.sds52.sha, SDS52_SHA);
    for (const row of pins.w4) {
      assert.equal(row.sha, W4_SHAS[row.id], row.id);
    }
  }
});

test("catalog has 12 examples across 4 families when example.json files exist", () => {
  const { examples, errors } = loadCatalog();
  assert.deepEqual(errors, []);
  const byFamily = new Map(FAMILIES.map((f) => [f, examples.filter((e) => e.family === f)]));
  for (const family of FAMILIES) {
    const list = byFamily.get(family);
    if (list.length === 0) continue;
    assert.ok(list.length >= 1, `${family} has example.json files but catalog is empty`);
  }
  if (examples.length === 12) {
    assert.equal(examples.length, 12);
    assert.equal(
      FAMILIES.filter((f) => byFamily.get(f).length > 0).length,
      4,
    );
    assert.equal(new Set(examples.map((e) => e.family)).size, 4);
  }
});

test("each example.json has required fields and SOURCE.md", () => {
  const { examples } = loadCatalog();
  for (const example of examples) {
    const raw = JSON.parse(readFileSync(example.examplePath, "utf8"));
    for (const key of REQUIRED_EXAMPLE_FIELDS) {
      assert.notEqual(raw[key], undefined, `${example.id} missing ${key}`);
      assert.notEqual(raw[key], null, `${example.id} null ${key}`);
    }
    assert.equal(typeof raw.id, "string");
    assert.ok(raw.id.length > 0, `${example.id} empty id`);
    assert.equal(raw.family, example.family);
    assert.ok(FAMILIES.includes(raw.family), `${raw.id} unknown family ${raw.family}`);
    assert.equal(typeof raw.kind, "string");
    assert.ok(raw.kind.trim().length > 0, `${raw.id} empty kind`);
    assert.ok(Array.isArray(raw.engines) && raw.engines.length > 0, `${raw.id} engines`);
    assert.equal(typeof raw.inputs, "object");
    assert.ok(raw.inputs && !Array.isArray(raw.inputs), `${raw.id} inputs object`);
    assert.equal(typeof raw.changedFact, "string");
    assert.ok(raw.changedFact.trim().length > 0, `${raw.id} changedFact`);
    assert.ok(raw.source && typeof raw.source === "object", `${raw.id} source`);
    assert.match(String(raw.source.beforeSha), SHA_RE, `${raw.id} source.beforeSha`);
    assert.match(String(raw.source.afterSha), SHA_RE, `${raw.id} source.afterSha`);
    assert.equal(raw.source.beforeSha.length, 40);
    assert.equal(raw.source.afterSha.length, 40);
    assert.ok(existsSync(join(example.dir, "SOURCE.md")), `${raw.id} SOURCE.md`);
  }
});

test("no-change-control examples exist in each family that has examples", () => {
  const { examples } = loadCatalog();
  for (const family of FAMILIES) {
    const list = examples.filter((e) => e.family === family);
    if (list.length === 0) continue;
    assert.ok(
      list.some((e) => e.kind === "no-change-control"),
      `${family} has examples but no no-change-control`,
    );
  }
});
