import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin", "webhook-drift.mjs");
const DIALECT = "https://json-schema.org/draft/2020-12/schema";

// Frozen from an independent Ajv 8.17.1 Draft 2020-12 run over this finite
// witness pool. Ajv is intentionally not a product or test dependency.
const WITNESSES = [
  null,
  false,
  true,
  -1,
  0,
  1,
  1.5,
  "",
  "x",
  "xx",
  [],
  [1],
  ["x"],
  {},
  { x: 1 },
  { x: "x" },
  { y: 1 },
];

function schema(body) {
  return { $schema: DIALECT, ...body };
}

const cases = [
  {
    name: "boolean true and an empty schema object have the same instance set",
    before: true,
    after: schema({}),
    expected: "unchanged",
    lost: [],
    gained: [],
  },
  {
    name: "omitted required and empty required have the same instance set",
    before: schema({ type: "object" }),
    after: schema({ type: "object", required: [] }),
    expected: "unchanged",
    lost: [],
    gained: [],
  },
  {
    name: "required is inapplicable to an explicitly string-only schema",
    before: schema({ type: "string" }),
    after: schema({ type: "string", required: ["x"] }),
    expected: "unchanged",
    lost: [],
    gained: [],
  },
  {
    name: "omitted minLength and minLength zero have the same instance set",
    before: schema({ type: "string" }),
    after: schema({ type: "string", minLength: 0 }),
    expected: "unchanged",
    lost: [],
    gained: [],
  },
  {
    name: "omitted and true additionalProperties have the same instance set",
    before: schema({ type: "object" }),
    after: schema({ type: "object", additionalProperties: true }),
    expected: "unchanged",
    lost: [],
    gained: [],
  },
  {
    name: "empty-schema and true additionalProperties have the same instance set",
    before: schema({ type: "object", additionalProperties: {} }),
    after: schema({ type: "object", additionalProperties: true }),
    expected: "unchanged",
    lost: [],
    gained: [],
  },
  {
    name: "omitted and true items have the same instance set",
    before: schema({ type: "array" }),
    after: schema({ type: "array", items: true }),
    expected: "unchanged",
    lost: [],
    gained: [],
  },
  {
    name: "removing an items schema is compatible",
    before: schema({ type: "array", items: { type: "string" } }),
    after: schema({ type: "array" }),
    expected: "compatible",
    lost: [],
    gained: [[1]],
  },
  {
    name: "removing const is compatible",
    before: schema({ type: "number", const: 1 }),
    after: schema({ type: "number" }),
    expected: "compatible",
    reason: "const-removed",
    lost: [],
    gained: [0],
  },
  {
    name: "const excluded by type has the false-schema instance set",
    before: schema({ type: "string", const: 1 }),
    after: false,
    expected: "unchanged",
    lost: [],
    gained: [],
  },
  {
    name: "adding an optional true property under default additionalProperties is unchanged",
    before: schema({ type: "object" }),
    after: schema({ type: "object", properties: { x: true } }),
    expected: "unchanged",
    lost: [],
    gained: [],
  },
  {
    name: "removing an optional property schema is compatible",
    before: schema({ type: "object", properties: { x: { type: "string" } } }),
    after: schema({ type: "object" }),
    expected: "compatible",
    lost: [],
    gained: [{ x: 1 }],
  },
  {
    name: "adding an optional false property is breaking",
    before: schema({ type: "object" }),
    after: schema({ type: "object", properties: { x: false } }),
    expected: "breaking",
    lost: [{ x: 1 }],
    gained: [],
  },
  {
    name: "enum masks a type-union widening that accepts no new enum value",
    before: schema({ type: "string", enum: ["x"] }),
    after: schema({ type: ["string", "number"], enum: ["x"] }),
    expected: "unchanged",
    lost: [],
    gained: [],
  },
  {
    name: "enum can mask a new length bound",
    before: schema({ type: "string", enum: ["a"] }),
    after: schema({ type: "string", enum: ["a"], minLength: 1 }),
    expected: "unknown",
    reason: "constraint-interaction-unsupported",
    lost: [],
    gained: [],
  },
  {
    name: "minimum one to exclusiveMinimum zero is compatible",
    before: schema({ type: "number", minimum: 1 }),
    after: schema({ type: "number", exclusiveMinimum: 0 }),
    expected: "compatible",
    reason: "numeric-weakened",
    lost: [],
    gained: [0.5],
  },
  {
    name: "exclusiveMinimum zero to minimum zero is compatible",
    before: schema({ type: "number", exclusiveMinimum: 0 }),
    after: schema({ type: "number", minimum: 0 }),
    expected: "compatible",
    reason: "numeric-weakened",
    lost: [],
    gained: [0],
  },
  {
    name: "mixed pattern and length changes stay unknown without an inclusion proof",
    before: schema({ type: "string", pattern: "^a" }),
    after: schema({ type: "string", minLength: 1 }),
    expected: "unknown",
    reason: "constraint-interaction-unsupported",
    lost: [],
    gained: ["b"],
  },
  {
    name: "format changes stay unknown without an assertion vocabulary",
    before: schema({ type: "string", format: "email" }),
    after: schema({ type: "string", format: "uuid" }),
    expected: "unknown",
    reason: "format-semantics-unsupported",
    lost: [],
    gained: [],
  },
  {
    name: "nested unsupported allOf cannot become a proven breaking change",
    before: schema({
      type: "object",
      properties: { x: { type: "string", allOf: [false] } },
    }),
    after: schema({
      type: "object",
      properties: { x: { type: "number", allOf: [false] } },
    }),
    expected: "unknown",
    reason: "unsupported-keyword",
    lost: [],
    gained: [],
  },
  {
    name: "unsupported anyOf cannot become a proven breaking type change",
    before: schema({ type: "string", anyOf: [false] }),
    after: schema({ type: "number", anyOf: [false] }),
    expected: "unknown",
    reason: "unsupported-keyword",
    lost: [],
    gained: [],
  },
  {
    name: "unevaluatedProperties cannot be ignored for a proven additionalProperties verdict",
    before: schema({ type: "object", unevaluatedProperties: false }),
    after: schema({ type: "object", unevaluatedProperties: false, additionalProperties: false }),
    expected: "unknown",
    reason: "unsupported-keyword",
    lost: [],
    gained: [],
  },
  {
    name: "a sibling constraint on a chained local ref remains effective",
    before: schema({
      type: "object",
      properties: { x: { $ref: "#/$defs/A" } },
      $defs: {
        A: { $ref: "#/$defs/B", minimum: 0 },
        B: { type: "number" },
      },
    }),
    after: schema({
      type: "object",
      properties: { x: { $ref: "#/$defs/A" } },
      $defs: {
        A: { $ref: "#/$defs/B", minimum: 5 },
        B: { type: "number" },
      },
    }),
    pointer: "/properties/x",
    expected: "breaking",
    reason: "numeric-tightened",
    lost: [{ x: 1 }],
    gained: [],
  },
];

function runCase(entry) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cw14-schema-witness-"));
  const beforePath = path.join(temp, "before.json");
  const afterPath = path.join(temp, "after.json");
  const usedPath = path.join(temp, "used.json");
  const outDir = path.join(temp, "cold-out");
  fs.writeFileSync(beforePath, `${JSON.stringify(entry.before)}\n`);
  fs.writeFileSync(afterPath, `${JSON.stringify(entry.after)}\n`);
  fs.writeFileSync(usedPath, `${JSON.stringify({ pointers: [entry.pointer || ""] })}\n`);
  const result = spawnSync(
    process.execPath,
    [BIN, "--before", beforePath, "--after", afterPath, "--used", usedPath, "--out-dir", outDir],
    { encoding: "utf8", cwd: ROOT, timeout: 20_000 },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const brief = JSON.parse(fs.readFileSync(path.join(outDir, "drift-brief.json"), "utf8"));
  return brief;
}

for (const entry of cases) {
  test(`Ajv witness: ${entry.name}`, () => {
    assert.ok(WITNESSES.length <= 20, "oracle witness pool must stay bounded");
    if (entry.expected === "breaking") assert.ok(entry.lost.length > 0);
    if (entry.expected === "compatible") assert.ok(entry.gained.length > 0);
    if (entry.expected === "unchanged") {
      assert.deepEqual(entry.lost, []);
      assert.deepEqual(entry.gained, []);
    }

    const brief = runCase(entry);
    if (entry.expected === "unchanged") {
      assert.equal(brief.impact.unchangedCount, 1);
      assert.equal(brief.impact.breaking.length, 0);
      assert.equal(brief.impact.compatible.length, 0);
      assert.equal(brief.impact.unknown.length, 0);
      return;
    }
    const rows = brief.impact[entry.expected];
    assert.equal(rows.length, 1, JSON.stringify(brief.impact));
    if (entry.reason) assert.equal(rows[0].reason, entry.reason);
  });
}
