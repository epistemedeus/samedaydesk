import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  ENGINE_AMOUNT_DECIMAL,
  ENGINE_FIELD,
  ENGINE_JOB_ID,
  ENGINE_NOT,
  ENGINE_SUBJECT,
  ENGINE_UNIT,
  USEFUL_JOBS_ARCHIVE_BYTES,
  USEFUL_JOBS_ARCHIVE_SHA256,
  WRONG_UNIT_FROM_ENGINE_AFTER,
  engineArchivePin,
} from "../lib/pins.mjs";
import { fixture } from "./helpers.mjs";

describe("PR51 vendor-budget price facts are the engine fixtures", () => {
  it("committed useful-jobs archive matches PR51 pins", () => {
    const pin = engineArchivePin();
    assert.equal(pin.ok, true);
    assert.equal(pin.bytes, USEFUL_JOBS_ARCHIVE_BYTES);
    assert.equal(pin.sha256, USEFUL_JOBS_ARCHIVE_SHA256);
    assert.equal(pin.purchaseAuthority, false);
  });

  it("ok.json is the decimal form of gpt-4.1-input from samples/pricing/a/before.json", () => {
    const facts = JSON.parse(readFileSync(fixture("engine/pr51-pricing-a-before.json"), "utf8"));
    assert.equal(facts.engine, ENGINE_JOB_ID);
    assert.equal(facts.not, ENGINE_NOT);
    const row = facts.rows.find((item) => item.field === ENGINE_FIELD);
    assert.equal(row.unit, ENGINE_UNIT);
    assert.equal(typeof row.value, "number");
    assert.equal(row.value, 2);

    const ok = JSON.parse(readFileSync(fixture("ok.json"), "utf8"));
    assert.equal(ok.amount, ENGINE_AMOUNT_DECIMAL);
    assert.equal(Number(ok.amount), row.value);
    assert.equal(ok.unit, ENGINE_UNIT);
    assert.equal(ok.provenance, "fixture");
    assert.equal(typeof ok.amount, "string");
    assert.equal(ENGINE_SUBJECT, "pr51-vendor-budget-price-facts");
  });

  it("wrong-unit fixture is the PR51 after.json unit-change spelling", () => {
    const wrong = JSON.parse(readFileSync(fixture("wrong-unit.json"), "utf8"));
    assert.equal(wrong.unit, WRONG_UNIT_FROM_ENGINE_AFTER);
    assert.notEqual(wrong.unit, ENGINE_UNIT);
  });
});
