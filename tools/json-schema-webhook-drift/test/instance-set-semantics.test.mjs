import test from "node:test";
import assert from "node:assert/strict";
import { classifyPair, fingerprintUsedNode } from "../lib/compare.mjs";
import { CLASSIFICATION_REASONS } from "../lib/contract.mjs";

const dialect = "https://json-schema.org/draft/2020-12/schema";

function used(before, after, pointer = "") {
  const beforeFp = fingerprintUsedNode(pointer === "" ? before : at(before, pointer), before, "json-schema");
  const afterFp = fingerprintUsedNode(pointer === "" ? after : at(after, pointer), after, "json-schema");
  return classifyPair(beforeFp, afterFp);
}

function at(doc, pointer) {
  if (pointer === "") return doc;
  const tokens = pointer.slice(1).split("/");
  let cur = doc;
  for (const token of tokens) cur = cur[token];
  return cur;
}

function objectWithAmount(type) {
  return {
    $schema: dialect,
    type: "object",
    properties: { amount: { type }, note: { type: "string" } },
  };
}

test("root used pointer sees nested amount type change as breaking", () => {
  const row = used(objectWithAmount("number"), objectWithAmount("string"), "");
  assert.equal(row.class, "breaking");
  assert.equal(row.reason, "type-change");
});

test("integer to number is compatible type-weakened; number to integer is breaking", () => {
  const weaken = used(
    { $schema: dialect, type: "integer" },
    { $schema: dialect, type: "number" },
    "",
  );
  assert.equal(weaken.class, "compatible");
  assert.equal(weaken.reason, CLASSIFICATION_REASONS.typeWeakened);
  const tighten = used(
    { $schema: dialect, type: "number" },
    { $schema: dialect, type: "integer" },
    "",
  );
  assert.equal(tighten.class, "breaking");
  assert.equal(tighten.reason, CLASSIFICATION_REASONS.typeTightened);
});

test("type string and [string] are the same instance set", () => {
  const row = used(
    { $schema: dialect, type: "string" },
    { $schema: dialect, type: ["string"] },
    "",
  );
  assert.equal(row.class, "unchanged");
});

test("string to [string,null] is compatible weakening; reverse is breaking", () => {
  const weaken = used(
    { $schema: dialect, type: "string" },
    { $schema: dialect, type: ["string", "null"] },
    "",
  );
  assert.equal(weaken.class, "compatible");
  const tighten = used(
    { $schema: dialect, type: ["string", "null"] },
    { $schema: dialect, type: "string" },
    "",
  );
  assert.equal(tighten.class, "breaking");
});

test("enum widen is compatible; enum narrow is breaking; reorder is unchanged", () => {
  const base = (values) => ({ $schema: dialect, type: "string", enum: values });
  assert.equal(used(base(["a"]), base(["a", "b"]), "").class, "compatible");
  assert.equal(used(base(["a", "b"]), base(["a"]), "").class, "breaking");
  assert.equal(used(base(["a", "b"]), base(["b", "a"]), "").class, "unchanged");
});

test("OpenAPI nullable is unknown, not a certain JSON Schema verdict", () => {
  const row = used(
    { $schema: dialect, type: "string", nullable: false },
    { $schema: dialect, type: "string", nullable: true },
    "",
  );
  assert.equal(row.class, "unknown");
  assert.equal(row.reason, CLASSIFICATION_REASONS.unsupportedNullable);
});

test("additionalProperties schema type change at root used is breaking", () => {
  const before = {
    $schema: dialect,
    type: "object",
    properties: { id: { type: "string" } },
    additionalProperties: { type: "string" },
  };
  const after = {
    ...before,
    additionalProperties: { type: "number" },
  };
  const row = used(before, after, "");
  assert.equal(row.class, "breaking");
});

test("items minLength tighten at used array schema is breaking", () => {
  const wrap = (minLength) => ({
    $schema: dialect,
    type: "object",
    properties: { tags: { type: "array", items: { type: "string", minLength } } },
  });
  const row = used(wrap(1), wrap(5), "/properties/tags");
  assert.equal(row.class, "breaking");
  assert.equal(row.reason, "numeric-tightened");
});

test("nested $ref target type change at root used is breaking", () => {
  const doc = (type) => ({
    $schema: dialect,
    type: "object",
    properties: { amount: { $ref: "#/$defs/A" } },
    $defs: { A: { type } },
  });
  const row = used(doc("number"), doc("string"), "");
  assert.equal(row.class, "breaking");
});

test("allOf and prefixItems are unknown, not certain unchanged", () => {
  const allOf = used(
    { $schema: dialect, type: "string" },
    { $schema: dialect, type: "string", allOf: [{ minLength: 5 }] },
    "",
  );
  assert.equal(allOf.class, "unknown");
  assert.equal(allOf.reason, CLASSIFICATION_REASONS.unsupportedKeyword);
  const prefix = used(
    { $schema: dialect, type: "array", prefixItems: [{ type: "string" }] },
    { $schema: dialect, type: "array", prefixItems: [{ type: "number" }] },
    "",
  );
  assert.equal(prefix.class, "unknown");
});

test("unused sibling type change does not drive a leaf used pointer", () => {
  const row = used(objectWithAmount("number"), objectWithAmount("number"), "/properties/amount");
  assert.equal(row.class, "unchanged");
  const sibling = {
    $schema: dialect,
    type: "object",
    properties: { amount: { type: "number" }, note: { type: "number" } },
  };
  const leaf = used(objectWithAmount("number"), sibling, "/properties/amount");
  assert.equal(leaf.class, "unchanged");
});
