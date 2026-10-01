import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { parseTerms } from "../src/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schema = JSON.parse(
  readFileSync(join(root, "schema/funded-task-terms.v1.json"), "utf8"),
) as object;

function compile() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema);
}

function load(rel: string): unknown {
  return JSON.parse(readFileSync(join(root, rel), "utf8"));
}

test("JSON Schema accepts the golden fixture", () => {
  const validate = compile();
  const doc = load("fixtures/golden/complete.terms.json");
  assert.equal(validate(doc), true, JSON.stringify(validate.errors));
});

test("JSON Schema rejects seeded negatives", () => {
  const validate = compile();
  const files = [
    "float-reward.json",
    "missing-verifier-version.json",
    "max-corrections-absent.json",
    "max-corrections-negative.json",
    "missing-reservation-duration.json",
    "missing-appeal-route.json",
    "artifact-executable-payload.json",
  ];
  for (const file of files) {
    const doc = load(`fixtures/negatives/${file}`);
    assert.equal(validate(doc), false, file);
    const parsed = parseTerms(doc);
    assert.equal(parsed.ok, false, file);
  }
});

test("JSON Schema rejects JS number money and llm-only authority", () => {
  const validate = compile();
  const golden = load("fixtures/golden/complete.terms.json") as Record<string, unknown>;
  const numberMoney = structuredClone(golden);
  (numberMoney.reward as Record<string, unknown>).amount = 2;
  assert.equal(validate(numberMoney), false);
  const llm = structuredClone(golden);
  llm.fundTransferAuthority = { requesterAcceptRequired: true, llmVerdictAlone: true };
  assert.equal(validate(llm), false);
});
