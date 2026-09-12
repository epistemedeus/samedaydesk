import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyEngineLifecycle } from "../src/classify.mjs";
import { LIFECYCLE_KINDS, acceptEngineLifecycle } from "../src/contract.mjs";
import { parseStdoutJson } from "../src/json.mjs";

describe("lifecycle classification", () => {
  it("accepts a whole JSON document with ok true and required outputs", () => {
    const classified = classifyEngineLifecycle({
      wrapper: {
        ok: true,
        sold: false,
        outputs: [{ name: "budget-impact.json" }, { name: "budget-impact.md" }],
        engine: { ok: true, status: "actionable" },
      },
      spawn: { status: 0, signal: null, errorCode: null, stderr: "", timedOut: false },
      engineStdout: JSON.stringify({ ok: true, appId: "vendor-budget-impact", status: "actionable" }),
      requiredOutputCount: 2,
    });
    assert.equal(classified.kind, LIFECYCLE_KINDS.ENGINE_RAN);
    assert.equal(classified.accepted, true);
    assert.equal(classified.domainOutcome, "actionable");
    assert.equal(acceptEngineLifecycle(classified), true);
  });

  it("keeps domain status refused as engine-ran, not a timeout or exit failure", () => {
    const classified = classifyEngineLifecycle({
      wrapper: {
        ok: true,
        sold: false,
        outputs: [{ name: "annotations.json" }, { name: "annotations.md" }],
      },
      spawn: { status: 0, signal: null, errorCode: null, stderr: "", timedOut: false },
      engineStdout: JSON.stringify({ ok: true, appId: "evidence-ci-annotation", status: "refused" }),
      requiredOutputCount: 2,
    });
    assert.equal(classified.kind, LIFECYCLE_KINDS.ENGINE_RAN);
    assert.equal(classified.accepted, true);
    assert.equal(classified.domainOutcome, "refused");
    assert.notEqual(classified.kind, LIFECYCLE_KINDS.TIMEOUT);
    assert.notEqual(classified.kind, LIFECYCLE_KINDS.NONZERO_EXIT);
  });

  it("rejects sliced decoy JSON even when wrapper.ok is true", () => {
    const stdout = 'noise { "ok": true, "decoy": true } trailing';
    const parsed = parseStdoutJson(stdout);
    assert.equal(parsed.sliced, true);
    assert.equal(parsed.whole, false);
    const classified = classifyEngineLifecycle({
      wrapper: { ok: true, sold: false, outputs: [] },
      spawn: { status: 0, signal: null, errorCode: null, stderr: "", timedOut: false },
      engineStdout: stdout,
      requiredOutputCount: 2,
    });
    assert.equal(classified.kind, LIFECYCLE_KINDS.INVALID_JSON);
    assert.equal(classified.accepted, false);
    assert.equal(classified.hiddenByWrapperSuccess, true);
  });

  it("rejects wrapper success when required outputs are missing", () => {
    const classified = classifyEngineLifecycle({
      wrapper: { ok: true, sold: false, outputs: [] },
      spawn: { status: 0, signal: null, errorCode: null, stderr: "", timedOut: false },
      engineStdout: JSON.stringify({ ok: true, status: "actionable" }),
      requiredOutputCount: 2,
    });
    assert.equal(classified.kind, LIFECYCLE_KINDS.HIDDEN_BY_WRAPPER);
    assert.equal(classified.accepted, false);
    assert.equal(classified.hiddenByWrapperSuccess, true);
  });

  it("classifies timeout separately from engine-refused JSON", () => {
    const timeout = classifyEngineLifecycle({
      wrapper: null,
      spawn: { status: null, signal: "SIGTERM", errorCode: "ETIMEDOUT", stderr: "", timedOut: true },
      engineStdout: "",
      requiredOutputCount: 2,
    });
    assert.equal(timeout.kind, LIFECYCLE_KINDS.TIMEOUT);
    assert.equal(timeout.accepted, false);

    const refused = classifyEngineLifecycle({
      wrapper: { ok: false, sold: false, outputs: [], code: "missing-required-inputs" },
      spawn: { status: 2, signal: null, errorCode: null, stderr: "", timedOut: false },
      engineStdout: JSON.stringify({
        ok: false,
        refused: true,
        code: "missing-required-inputs",
        error: "engine closed",
      }),
      requiredOutputCount: 2,
    });
    assert.equal(refused.kind, LIFECYCLE_KINDS.ENGINE_REFUSED_JSON);
    assert.equal(refused.accepted, false);
    assert.equal(refused.code, "missing-required-inputs");
  });
});
