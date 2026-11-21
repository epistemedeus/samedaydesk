import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { validateBundle } from "../src/schema.mjs";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "../fixtures");

function load(name) {
  return JSON.parse(readFileSync(join(fixtures, name), "utf8"));
}

test("reservation-preserved keeps reservationId and unknown fields", () => {
  const input = load("reservation-preserved.json");
  const result = validateBundle(input);
  assert.equal(result.ok, true);
  assert.equal(result.bundle.tasks[0].reservationId, "rsv_keep_exact_identity");
  assert.equal(result.unknown.bundle.customerTag, "keep-this-bundle-field");
  assert.equal(result.unknown.tasks[0].unknown.task.priorReviewNote, "keep-this-task-field");
  assert.equal(result.unknown.tasks[0].unknown.terms.requesterLabel, "keep-this-term-field");
  assert.equal(result.unknown.tasks[0].unknown.delivery.reviewerMemo, "keep-this-delivery-field");
  assert.equal(result.unknown.tasks[0].unknown.effort.operatorClock, "keep-this-effort-field");
  assert.equal(result.bundle.tasks[0].termsDigest, "ddd444eeee5555");
  assert.equal(result.bundle.tasks[0].expectedRevision, 3);
  assert.equal(result.bundle.tasks[0].publicationConsent, false);
});

test("duplicate criteria are refused with the cold-requester code", () => {
  const input = load("bundle-helpful.json");
  input.tasks[0].criteria = ["public-example", "public-example"];
  const result = validateBundle(input);
  assert.equal(result.ok, false);
  assert.equal(result.code, "criteria_refused");
});

test("more than 16 criteria are refused", () => {
  const input = load("bundle-helpful.json");
  input.tasks[0].criteria = Array.from({ length: 17 }, (_, index) => `c${index}`);
  const result = validateBundle(input);
  assert.equal(result.ok, false);
  assert.equal(result.code, "criteria_limit_refused");
});

test("non-atomic gross is refused", () => {
  const input = load("bundle-helpful.json");
  input.tasks[0].grossAtomic = "1.25";
  const result = validateBundle(input);
  assert.equal(result.ok, false);
  assert.match(result.message, /grossAtomic/);
});

test("duplicate taskId values are refused", () => {
  const input = load("bundle-helpful.json");
  input.tasks[1].taskId = input.tasks[0].taskId;
  const result = validateBundle(input);
  assert.equal(result.ok, false);
  assert.match(result.message, /unique/);
});
