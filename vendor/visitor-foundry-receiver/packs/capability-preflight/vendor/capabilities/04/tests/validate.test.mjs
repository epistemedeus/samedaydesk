import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  FREE_ALTERNATIVE_STATE,
  INPUT_SCHEMA,
  validateCostDryRunInput,
  validateFreeAlternative,
} from "../src/index.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const load = (name) => JSON.parse(readFileSync(join(root, "fixtures", name), "utf8"));

test("validate: positive input normalizes", () => {
  const n = validateCostDryRunInput(load("positive.json"));
  assert.equal(n.schema, INPUT_SCHEMA);
  assert.equal(n.quotes.length, 2);
  assert.equal(n.quotes[0].present, true);
  assert.equal(n.freeAlternatives[0].state, FREE_ALTERNATIVE_STATE.EQUIVALENT);
});

test("validate: rejects unknown free alternative state", () => {
  assert.throws(
    () =>
      validateFreeAlternative({
        id: "x",
        label: "x",
        state: "empty",
      }),
    (err) => err.code === "invalid_input",
  );
});

test("validate: unavailable is accepted as distinct state", () => {
  const fa = validateFreeAlternative({
    id: "none",
    label: "None",
    state: "unavailable",
    basis: "checked_v1",
  });
  assert.equal(fa.state, FREE_ALTERNATIVE_STATE.UNAVAILABLE);
});

test("validate: forbidden nested field rejects", () => {
  assert.throws(
    () => validateCostDryRunInput(load("negative-forbidden.json")),
    (err) => err.code === "forbidden_claim",
  );
});

test("validate: missing quotes[] rejects", () => {
  assert.throws(
    () => validateCostDryRunInput({ taskId: "t" }),
    (err) => err.code === "missing_requirement",
  );
});
