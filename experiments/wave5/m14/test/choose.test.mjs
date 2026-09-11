import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { join } from "node:path";
import { CHOOSE_SCHEMA } from "../lib/paths.mjs";
import { FIXTURES, PAID, previewJson } from "./helpers.mjs";

describe("m14 choose proper input", () => {
  it("pricing JSON pair selects vendor-budget-impact with before/after from filenames", () => {
    const r = previewJson([
      "choose",
      "--files",
      join(PAID, "vendor-budget-impact/before.json"),
      join(PAID, "vendor-budget-impact/after.json"),
    ]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.equal(r.json.ok, true);
    assert.equal(r.json.schema, CHOOSE_SCHEMA);
    assert.equal(r.json.jobId, "vendor-budget-impact");
    assert.deepEqual(
      r.json.wrapperArgs,
      [
        "--before",
        join(PAID, "vendor-budget-impact/before.json"),
        "--after",
        join(PAID, "vendor-budget-impact/after.json"),
      ],
    );
    assert.equal(r.json.orderRule, "filename-before-after");
  });

  it("feed XML pair selects feed-agenda", () => {
    const r = previewJson([
      "choose",
      "--files",
      join(PAID, "feed-agenda/before.xml"),
      join(PAID, "feed-agenda/after.xml"),
    ]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.equal(r.json.jobId, "feed-agenda");
    assert.ok(r.json.limits.some((l) => /live deadlines/i.test(l) || /Sample feed/i.test(l) || /not live/i.test(l)));
  });

  it("evidence packet selects evidence-ci-annotation", () => {
    const r = previewJson(["choose", "--files", join(PAID, "evidence-ci-annotation/input.json")]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.equal(r.json.jobId, "evidence-ci-annotation");
    assert.equal(r.json.wrapperArgs[0], "--input");
  });

  it("next-run manifest selects repeat-job-record", () => {
    const r = previewJson(["choose", "--files", join(PAID, "repeat-job-record/next-run.json")]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.equal(r.json.jobId, "repeat-job-record");
    assert.equal(r.json.wrapperArgs[0], "--next-run");
  });

  it("OpenAPI pair plus used.json selects api-upgrade-brief", () => {
    const r = previewJson([
      "choose",
      "--files",
      join(FIXTURES, "openapi-before.yaml"),
      join(FIXTURES, "openapi-after.yaml"),
      join(FIXTURES, "used.json"),
    ]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.equal(r.json.jobId, "api-upgrade-brief");
    assert.ok(r.json.wrapperArgs.includes("--used"));
  });

  it("listing snapshot selects listing-repair-packet", () => {
    const r = previewJson(["choose", "--files", join(FIXTURES, "listing.json")]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.equal(r.json.jobId, "listing-repair-packet");
  });

  it("HTML is not silently treated as a successful pricing input", () => {
    const r = previewJson(["choose", "--files", join(FIXTURES, "not-pricing.html"), join(PAID, "vendor-budget-impact/after.json")]);
    assert.equal(r.status, 2, r.stderr + r.stdout);
    assert.equal(r.json.ok, false);
    assert.equal(r.json.code, "unsupported-input-kind");
    assert.match(r.json.error, /HTML is not pricing-row JSON/);
  });

  it("used.json alone does not pretend the OpenAPI pair was supplied", () => {
    const r = previewJson(["choose", "--files", join(FIXTURES, "used.json")]);
    assert.equal(r.status, 2, r.stderr + r.stdout);
    assert.equal(r.json.ok, false);
    assert.equal(r.json.code, "incomplete-input-set");
    assert.equal(r.json.jobId, "api-upgrade-brief");
  });

  it("choose --job prints required flags from the live catalog", () => {
    const r = previewJson(["choose", "--job", "vendor-budget-impact"]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.deepEqual(r.json.requiredInputs, ["--before", "--after"]);
    assert.ok(r.json.limits.length > 0);
  });

  it("unknown job is a wrapper-style refuse, not a chosen catalog row", () => {
    const r = previewJson(["choose", "--job", "not-a-job"]);
    assert.equal(r.status, 2, r.stderr + r.stdout);
    assert.equal(r.json.code, "unknown-job");
  });
});
