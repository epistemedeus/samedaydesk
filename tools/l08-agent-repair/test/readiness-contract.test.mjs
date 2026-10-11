import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  PRICE_PATTERN,
  classifySchema,
  diagnoseSuppliedContract,
  semanticResult,
} from "../lib/readiness-contract.mjs";

const source = readFileSync(fileURLToPath(new URL("../lib/readiness-contract.mjs", import.meta.url)), "utf8");
const schema = {
  type: "object",
  properties: {
    data: {
      type: "object",
      required: ["quote"],
      properties: { quote: { type: "string" } },
    },
  },
};
const absentSchema = {
  type: "object",
  properties: {
    data: {
      type: "object",
      required: [],
      properties: { quote: { type: "string" } },
    },
  },
};

test("the contract module does not import the server", () => {
  assert.equal(source.includes("import "), false);
  assert.equal(source.includes("server/app.js"), false);
  assert.equal(source.includes("express"), false);
});

test("a schema-valid non-decimal quote fails and a decimal passes", () => {
  const soon = semanticResult({ data: { quote: "soon" } });
  const decimal = semanticResult({ data: { quote: "1.25" } });
  assert.equal(soon.shape, "string");
  assert.equal(soon.state, "fail");
  assert.equal(soon.code, "value_mismatch");
  assert.equal(decimal.state, "pass");
  assert.equal(decimal.code, null);
  assert.equal(PRICE_PATTERN.test("soon"), false);
  assert.equal(PRICE_PATTERN.test("1.25"), true);
  const wrong = diagnoseSuppliedContract({
    method: "POST",
    path: "/quote",
    requiredPaths: ["data.quote"],
    schema,
    body: { data: { quote: "soon" } },
  });
  const good = diagnoseSuppliedContract({
    method: "POST",
    path: "/quote",
    requiredPaths: ["data.quote"],
    schema,
    body: { data: { quote: "1.25" } },
  });
  assert.equal(wrong.schema.state, "pass");
  assert.equal(wrong.nextAction, "value_mismatch:data.quote");
  assert.equal(good.nextAction, "decimal_match");
  assert.notEqual(wrong.nextAction, good.nextAction);
  assert.equal(wrong.quoteGenerated, false);
  assert.equal(good.paymentSent, false);
});

test("a missing required path stays separate from the decimal result", () => {
  const diagnosed = diagnoseSuppliedContract({
    method: "POST",
    path: "/quote",
    requiredPaths: ["data.quote"],
    schema: absentSchema,
    body: { data: { quote: "1.25" } },
  });
  assert.deepEqual(classifySchema(absentSchema, ["data.quote"]), {
    state: "fail",
    code: "seller_response_required_path_missing:data.quote",
  });
  assert.equal(diagnosed.semantic.state, "pass");
  assert.equal(diagnosed.nextAction, "seller_response_required_path_missing:data.quote");
  assert.equal(semanticResult({ data: { quote: 1.25 } }).shape, "number");
  assert.equal(semanticResult({ data: { quote: null } }).state, "fail");
});
