import assert from "node:assert/strict";
import test from "node:test";
import { compareDocuments } from "../lib/cli.mjs";
const schema = (body) => ({ $schema: "http://json-schema.org/draft-07/schema#", type: "object", ...body });
function compare(before, after, pointer = "/required") {
  return compareDocuments({ beforeDoc: before, afterDoc: after, usedSpec: { pointers: [pointer] }, kind: "json-schema" }).impact;
}
test("Octokit organization.renamed selected required membership replacement is actionable", () => {
  // Exact keyword membership at CW10's pinned official Octokit schema pair.
  const before = schema({ required: ["action", "membership", "organization", "sender"], properties: { organization: { $ref: "./common/organization.schema.json" } } });
  const after = schema({ required: ["action", "changes", "organization", "sender"], properties: before.properties });
  const r = compare(before, after);
  assert.equal(r.breaking.length, 1); assert.equal(r.breaking[0].reason, "required-changed");
});
test("selected required uses set identity and missing means empty", () => {
  assert.equal(compare(schema({ required: ["a", "b"] }), schema({ required: ["b", "a"] })).unchanged.length, 1);
  assert.equal(compare(schema({}), schema({ required: [] })).unchanged.length, 1);
  assert.equal(compare(schema({}), schema({ required: ["a"] })).breaking.length, 1);
  assert.equal(compare(schema({ required: ["a"] }), schema({})).compatible.length, 1);
});
test("selected nested required retains schema location and type applicability", () => {
  const before = schema({ properties: { child: { type: "object", required: ["a"] } } });
  const after = schema({ properties: { child: { type: "object", required: ["a", "b"] } } });
  assert.equal(compare(before, after, "/properties/child/required").breaking.length, 1);
  assert.equal(compare({ $schema: "http://json-schema.org/draft-07/schema#", type: "string", required: ["a"] }, { $schema: "http://json-schema.org/draft-07/schema#", type: "string", required: ["b"] }).unchanged.length, 1);
});
test("a property named required is still a selected schema, not a keyword array", () => {
  const before = schema({ properties: { required: { type: "string" } } });
  const after = schema({ properties: { required: { type: "number" } } });
  assert.equal(compare(before, after, "/properties/required").breaking.length, 1);
});
test("malformed selected required stays unknown even when equal", () => {
  for (const value of [["x", "x"], [42], "x", null]) assert.equal(compare(schema({ required: value }), schema({ required: value })).unknown[0].reason, "invalid-required-keyword");
});
