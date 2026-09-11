import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { join } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { PREVIEW_SCHEMA } from "../lib/paths.mjs";
import { LAYER } from "../lib/classify.mjs";
import { FIXTURES, PAID, preview, previewJson } from "./helpers.mjs";

const BEFORE = join(PAID, "vendor-budget-impact/before.json");
const AFTER = join(PAID, "vendor-budget-impact/after.json");

describe("m14 preview process", { timeout: 180_000 }, () => {
  it("actionable pricing run is useful delivery with a human excerpt of the real artifact", () => {
    const r = previewJson(["preview", "--job", "vendor-budget-impact", "--before", BEFORE, "--after", AFTER]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.equal(r.json.schema, PREVIEW_SCHEMA);
    assert.equal(r.json.ok, true);
    assert.equal(r.json.layer, LAYER.USEFUL_DELIVERY);
    assert.equal(r.json.transport, "ok");
    assert.equal(r.json.analysis.status, "actionable");
    assert.equal(r.json.delivery.complete, true);
    assert.equal(r.json.payment.sold, false);
    assert.equal(r.json.payment.sample, false);
    assert.match(r.json.headline, /fieldChanges=2/);
    assert.ok(r.json.artifacts.json.actions.some((a) => a.fieldKey === "desk-chat-input"));
    assert.match(r.json.artifacts.markdown.excerpt.text, /desk-chat-input/);
    assert.equal(r.json.testedImplementation.sha, "aeef964fa188443078958d9d6d393afae1d542ee");
    assert.ok(r.json.unlikeHashes.length > 0);
    assert.notEqual(r.json.hashes.engineDigest, r.json.hashes.firstOutputSha256);
    assert.notEqual(r.json.hashes.inputsDigest, r.json.hashes.outputsDigest);
  });

  it("identical before/after is informational useful delivery, not a crash", () => {
    const r = previewJson(["preview", "--job", "vendor-budget-impact", "--before", BEFORE, "--after", BEFORE]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.equal(r.json.ok, true);
    assert.equal(r.json.layer, LAYER.USEFUL_DELIVERY);
    assert.equal(r.json.analysis.status, "informational");
    assert.match(r.json.headline, /fieldChanges=0/);
    assert.match(r.json.usefulness, /informational|no-change/i);
    assert.notEqual(r.json.layer, LAYER.TRANSPORT_FAILURE);
    assert.notEqual(r.json.layer, LAYER.ENGINE_FAILURE);
  });

  it("HTML pricing input is a valid analysis refusal with delivered artifacts", () => {
    const r = previewJson([
      "preview",
      "--job",
      "vendor-budget-impact",
      "--before",
      join(FIXTURES, "not-pricing.html"),
      "--after",
      AFTER,
    ]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.equal(r.json.ok, true);
    assert.equal(r.json.layer, LAYER.USEFUL_DELIVERY);
    assert.equal(r.json.transport, "ok");
    assert.equal(r.json.analysis.status, "refused");
    assert.equal(r.json.delivery.complete, true);
    assert.match(r.json.usefulness, /Valid analysis refusal/);
    assert.notEqual(r.json.layer, LAYER.TRANSPORT_FAILURE);
  });

  it("missing required input is wrapper-refuse, analysis not-run", () => {
    const r = previewJson(["preview", "--job", "vendor-budget-impact", "--before", BEFORE]);
    assert.equal(r.status, 2, r.stderr + r.stdout);
    assert.equal(r.json.ok, false);
    assert.equal(r.json.layer, LAYER.WRAPPER_REFUSE);
    assert.equal(r.json.wrapper.code, "missing-required-inputs");
    assert.equal(r.json.analysis.status, "not-run");
    assert.equal(r.json.delivery.complete, false);
    assert.match(r.json.usefulness, /No analysis ran/);
  });

  it("unknown job is wrapper-refuse, not an engine crash", () => {
    const r = previewJson(["preview", "--job", "not-a-job"]);
    assert.equal(r.status, 2, r.stderr + r.stdout);
    assert.equal(r.json.layer, LAYER.WRAPPER_REFUSE);
    assert.equal(r.json.wrapper.code, "unknown-job");
    assert.equal(r.json.transport, "rejected");
    assert.equal(r.json.analysis.status, "not-run");
  });

  it("--example is labeled sample and not a sale", () => {
    const r = previewJson(["preview", "--job", "vendor-budget-impact", "--example"]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.equal(r.json.ok, true);
    assert.equal(r.json.payment.sample, true);
    assert.equal(r.json.payment.sold, false);
    assert.equal(r.json.analysis.status, "partial");
  });

  it("text preview explains limits and does not call a refusal a crash", () => {
    const r = preview([
      "preview",
      "--job",
      "vendor-budget-impact",
      "--before",
      join(FIXTURES, "not-pricing.html"),
      "--after",
      AFTER,
      "--format",
      "text",
    ]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /Analysis: refused/);
    assert.match(r.stdout, /Valid analysis refusal/);
    assert.match(r.stdout, /sold=false/);
    assert.match(r.stdout, /No purchase authority|purchaseAuthority/i);
    assert.doesNotMatch(r.stdout, /engine-crash/);
  });

  it("actionable and no-change engine digests stay unequal", () => {
    const changed = previewJson(["preview", "--job", "vendor-budget-impact", "--before", BEFORE, "--after", AFTER]);
    const same = previewJson(["preview", "--job", "vendor-budget-impact", "--before", BEFORE, "--after", BEFORE]);
    assert.equal(changed.status, 0, changed.stderr);
    assert.equal(same.status, 0, same.stderr);
    assert.notEqual(changed.json.hashes.engineDigest, same.json.hashes.engineDigest);
    assert.notEqual(changed.json.hashes.outputsDigest, same.json.hashes.outputsDigest);
  });

  it("preview --from-result classifies wrapper JSON without spawning a second runner", async () => {
    const { runWrapperCli } = await import("../lib/run.mjs");
    const work = mkdtempSync(join(tmpdir(), "m14-from-"));
    const file = join(work, "result.json");
    const outDir = mkdtempSync(join(tmpdir(), "m14-wrap-"));
    const wrapped = runWrapperCli([
      "run",
      "vendor-budget-impact",
      "--before",
      BEFORE,
      "--after",
      AFTER,
      "--out-dir",
      outDir,
    ]);
    assert.equal(wrapped.json?.ok, true, wrapped.stderr + wrapped.stdout);
    writeFileSync(file, `${JSON.stringify(wrapped.json)}\n`);
    const r = previewJson(["preview", "--from-result", file]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.equal(r.json.layer, LAYER.USEFUL_DELIVERY);
    assert.equal(r.json.analysis.status, "actionable");
    assert.equal(r.json.delivery.complete, true);
  });
});
