import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { diffRecordShape, mapRecord } from "../src/mapping.mjs";
import { mappingRegistry, periodNPlus1Request, periodNRequest } from "../src/fixtures.mjs";
import { runNativeControl } from "../src/native-control.mjs";
import { CAPTURE_SCHEMA } from "../src/vendor-paths.mjs";
import { byKey, clone, endpoint, evaluate, evaluateAndApply } from "./helpers.mjs";

describe("materially changed later period", () => {
  test("v2 rows differ from v1 by renamed, moved, added, removed and type-changed fields", () => {
    const [v1] = mappingRegistry().versions;
    const diff = diffRecordShape(v1, periodNPlus1Request().records[0]);
    const kinds = (kind) => diff.filter((d) => d.kind === kind).map((d) => d.path).sort();
    assert.deepEqual(kinds("field_missing"), ["captureRef", "capturedAt", "heading", "keys", "notes", "state"]);
    assert.deepEqual(kinds("field_unexpected"), ["capture", "done", "outputKeys", "priority", "title"]);
    assert.deepEqual(diff.filter((d) => d.kind === "field_type_changed"), [{ kind: "field_type_changed", path: "consent", expected: "boolean", actual: "string" }]);
  });

  test("sent with the old mapping: schema_changed per record with field path, record key and action; nothing applied", () => {
    const ep = endpoint();
    evaluateAndApply(ep, periodNRequest());
    const body = evaluate(ep, periodNPlus1Request({ mappingVersion: "workflow-output.v1" })).body;
    assert.equal(body.ok, true);
    assert.equal(body.summary.exceptions, 5);
    body.records.forEach((r, i) => {
      assert.equal(r.outcome, "exception");
      assert.equal(r.exception.code, "schema_changed");
      assert.equal(r.exception.source, "mapping");
      assert.equal(r.exception.retryable, false);
      assert.equal(r.exception.recordKey, `r-00${i + 1}`);
      assert.equal(r.exception.fieldPath, `records[${i}].captureRef`);
      assert.match(r.exception.suggestedAction, /new mappingVersion/);
      assert.match(r.exception.suggestedAction, /never guesses/);
      assert.ok(r.exception.fields.length >= 12);
      assert.equal(r.completeness.complete, false);
    });
    assert.equal(ep.externalEffects(), 3);
  });

  test("with the declared v2 mapping the same rows map onto the agreed fields", () => {
    const [, v2] = mappingRegistry().versions;
    const record = periodNPlus1Request().records[0];
    const mapped = mapRecord(v2, record, { captureSchema: CAPTURE_SCHEMA });
    assert.equal(mapped.ok, true);
    assert.deepEqual(mapped.capture.payload, { title: record.title, status: "complete", output: record.outputKeys });
    assert.equal(mapped.capture.captureId, record.capture.id);
    assert.equal(mapped.capture.permission.permitted, true);
  });

  test("adaptation is explicit: removing v2 from the registry is mapping_version_unknown, not a guess", () => {
    const registry = clone(mappingRegistry());
    registry.versions = [registry.versions[0]];
    const res = evaluate(endpoint(), periodNPlus1Request(), { registry });
    assert.equal(res.body.ok, false);
    assert.equal(res.body.configErrors[0].code, "mapping_version_unknown");
  });

  test("an enum value the mapping does not list is schema_changed with value_not_in_enum", () => {
    const request = periodNPlus1Request({ stale: false });
    request.records[0].consent = "maybe";
    const ep = endpoint();
    evaluateAndApply(ep, periodNRequest());
    const r = byKey(evaluate(ep, request).body)["r-001"];
    assert.equal(r.exception.code, "schema_changed");
    assert.equal(r.exception.fields[0].kind, "value_not_in_enum");
    assert.equal(r.exception.fieldPath, "records[0].consent");
  });

  test("later period replays the period N accepted output through the journey: useful_change, useful_no_change, new_record", () => {
    const ep = endpoint();
    evaluateAndApply(ep, periodNRequest());
    const r = byKey(evaluate(ep, periodNPlus1Request({ stale: false })).body);
    assert.equal(r["r-001"].comparison, "useful_change");
    assert.equal(r["r-002"].comparison, "useful_no_change");
    assert.equal(r["r-003"].comparison, "useful_change");
    assert.equal(r["r-004"].comparison, "new_record");
    assert.equal(r["r-001"].period.recordEvidence.followsTaskId, periodNRequest().period.taskId);
  });

  test("native control on the journey's own fixtures: the rename is refused as schema_changed and not adapted", () => {
    const native = runNativeControl();
    assert.equal(native.steps.periodN.decision, "accept");
    assert.deepEqual(native.steps.laterSchemaChange, { exception: "schema_changed", missingFields: ["output"], complete: false, retryable: false, adapted: false });
    assert.equal(native.steps.laterChanged.outcome, "useful_change");
    assert.equal(native.steps.lostReplyReplay.recovered, true);
    assert.equal(native.steps.lostReplyReplay.secondEffect, false);
  });
});
