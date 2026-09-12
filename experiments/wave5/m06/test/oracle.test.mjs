import test from "node:test";
import assert from "node:assert/strict";
import { loadCorpus } from "../lib/paths.mjs";
import { checkWitnesses, validUnder } from "../lib/instance.mjs";
import { alwaysPass, alwaysFail, dummyAgrees } from "../lib/replay.mjs";

const corpus = loadCorpus();

test("every corpus case has consistent specified witnesses", () => {
  for (const entry of corpus.cases) {
    const result = checkWitnesses(entry);
    assert.equal(result.ok, true, `${entry.id}: ${(result.problems || []).join("; ")}`);
  }
});

test("nontrivial valid and invalid witnesses distinguish always-pass and always-fail", () => {
  const compare = corpus.cases.filter((entry) => entry.transport === "compare");
  const valid = compare.filter((entry) => entry.specified.relation === "compatible");
  const invalid = compare.filter((entry) => entry.specified.relation === "incompatible");
  assert.ok(valid.length >= 3, "need compatible witnesses");
  assert.ok(invalid.length >= 3, "need incompatible witnesses");
  assert.equal(
    compare.every((entry) => dummyAgrees(alwaysPass, entry)),
    false,
  );
  assert.equal(
    compare.every((entry) => dummyAgrees(alwaysFail, entry)),
    false,
  );
  assert.equal(valid.every((entry) => dummyAgrees(alwaysPass, entry)), true);
  assert.equal(invalid.every((entry) => dummyAgrees(alwaysFail, entry)), true);
  assert.equal(valid.some((entry) => dummyAgrees(alwaysFail, entry)), false);
  assert.equal(invalid.some((entry) => dummyAgrees(alwaysPass, entry)), false);
});

test("false schema true to false is a real instance-set change", () => {
  const entry = corpus.cases.find((item) => entryId(item, "false-schema-true-to-false"));
  assert.equal(validUnder(entry.before, { payload: { kept: true } }), true);
  assert.equal(validUnder(entry.after, { payload: { kept: true } }), false);
});

test("float minimum 1.0 is valid before 0.5 and invalid after 1.5", () => {
  const entry = corpus.cases.find((item) => entryId(item, "numeric-float-minimum-raised"));
  assert.equal(validUnder(entry.before, { amount: 1.0 }), true);
  assert.equal(validUnder(entry.after, { amount: 1.0 }), false);
});

test("$ref sibling minimum applies under specified 2020-12 semantics", () => {
  const entry = corpus.cases.find((item) => entryId(item, "ref-sibling-minimum-added"));
  assert.equal(validUnder(entry.before, { amount: 5 }), true);
  assert.equal(validUnder(entry.after, { amount: 5 }), false);
  assert.equal(validUnder(entry.after, { amount: 10 }), true);
});

test("required order is not an instance-set change", () => {
  const entry = corpus.cases.find((item) => entryId(item, "required-order-only"));
  const inst = { id: "a", amount: 1 };
  assert.equal(validUnder(entry.before, inst), true);
  assert.equal(validUnder(entry.after, inst), true);
  assert.equal(validUnder(entry.before, { id: "a" }), false);
  assert.equal(validUnder(entry.after, { id: "a" }), false);
});

function entryId(item, id) {
  return item.id === id;
}
