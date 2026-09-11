import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyResult, D01_CONTRACT, LAYER } from "../lib/classify.mjs";

describe("m14 classify layers", () => {
  it("SDS52 wrapper refuse is not an engine crash", () => {
    const c = classifyResult({
      ok: false,
      jobId: "vendor-budget-impact",
      code: "missing-required-inputs",
      error: "Caller mode requires --before, --after",
      sold: false,
      fundingState: "rejected",
      outputs: [],
    });
    assert.equal(c.layer, LAYER.WRAPPER_REFUSE);
    assert.equal(c.transport, "rejected");
    assert.equal(c.analysis.status, "not-run");
    assert.equal(c.useful, false);
    assert.equal(c.source, "sds52-wrapper");
  });

  it("SDS52 engine JSON with status refused and present files is useful delivery", () => {
    const dir = mkdtempSync(join(tmpdir(), "m14-refuse-"));
    const jsonPath = join(dir, "budget-impact.json");
    const mdPath = join(dir, "budget-impact.md");
    writeFileSync(jsonPath, "{\"status\":\"refused\"}\n");
    writeFileSync(mdPath, "refused\n");
    const c = classifyResult({
      ok: true,
      jobId: "vendor-budget-impact",
      sold: false,
      fundingState: "unfunded",
      engine: { ok: true, appId: "vendor-budget-impact", status: "refused", digest: "aaaa" },
      outputs: [
        { name: "budget-impact.json", path: jsonPath, sha256: "bb" },
        { name: "budget-impact.md", path: mdPath, sha256: "cc" },
      ],
    });
    assert.equal(c.analysis.outcome, "refused");
    assert.equal(c.layer, LAYER.USEFUL_DELIVERY);
    assert.equal(c.useful, true);
    assert.equal(c.transport, "ok");
  });

  it("named outputs that are absent are incomplete delivery, not a useful refusal", () => {
    const c = classifyResult({
      ok: true,
      jobId: "vendor-budget-impact",
      sold: false,
      engine: { ok: true, status: "refused", digest: "aaaa" },
      outputs: [{ name: "budget-impact.json", path: "/nonexistent-m14", sha256: "bb" }],
    });
    assert.equal(c.layer, LAYER.INCOMPLETE_DELIVERY);
    assert.equal(c.useful, false);
  });

  it("D01 contract fields are used when present, not re-derived", () => {
    const c = classifyResult({
      ok: true,
      jobId: "vendor-budget-impact",
      contract: D01_CONTRACT,
      transport: "ok",
      analysis: { status: "informational", outcome: "informational", identityVerified: null },
      delivery: { status: "complete", complete: true, expected: ["budget-impact.json"], present: ["budget-impact.json"], missing: [] },
      sold: false,
      fundingState: "unfunded",
      engine: { ok: true, status: "informational", digest: "dddd" },
      outputs: [],
    });
    assert.equal(c.source, D01_CONTRACT);
    assert.equal(c.layer, LAYER.USEFUL_DELIVERY);
    assert.equal(c.analysis.outcome, "informational");
    assert.equal(c.transport, "ok");
  });

  it("D01 engine-crash is transport failure, not a valid refusal", () => {
    const c = classifyResult({
      ok: false,
      jobId: "vendor-budget-impact",
      contract: D01_CONTRACT,
      code: "engine-crash",
      transport: "engine-crash",
      analysis: { status: "not-run", outcome: "crashed", identityVerified: null },
      delivery: { status: "not-attempted", complete: false, expected: [], present: [], missing: [] },
      sold: false,
      outputs: [],
    });
    assert.equal(c.layer, LAYER.TRANSPORT_FAILURE);
    assert.equal(c.useful, false);
  });
});
