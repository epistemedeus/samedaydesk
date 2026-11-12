import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";

import { REGISTRY_SCHEMA, TARGETS, validateMappingRegistry } from "../src/mapping.mjs";
import { mappingRegistry, periodNRequest } from "../src/fixtures.mjs";
import { clone, endpoint, evaluate, root } from "./helpers.mjs";

const paths = (result) => result.errors.map((e) => e.path);
const mutate = (fn) => { const r = clone(mappingRegistry()); fn(r); return validateMappingRegistry(r); };

describe("mapping registry validation", () => {
  test("the packaged registry is valid and declares every target in both versions", () => {
    const registry = mappingRegistry();
    assert.deepEqual(validateMappingRegistry(registry), { ok: true, errors: [] });
    assert.equal(registry.schema, REGISTRY_SCHEMA);
    for (const entry of registry.versions) assert.deepEqual(Object.keys(entry.targets).sort(), [...TARGETS].sort());
  });

  test("each bad config names the exact path", () => {
    const cases = [
      [(r) => { r.schema = "other"; }, "$.schema"],
      [(r) => { r.extra = 1; }, "$.extra"],
      [(r) => { r.versions = []; }, "$.versions"],
      [(r) => { r.versions[1].mappingVersion = "workflow-output.v1"; }, "$.versions[1].mappingVersion"],
      [(r) => { r.versions[0].mappingVersion = "Bad Version"; }, "$.versions[0].mappingVersion"],
      [(r) => { r.versions[1].targets["payload.output"] = { from: "outputKey" }; }, '$.versions[1].targets["payload.output"].from'],
      [(r) => { delete r.versions[0].targets["payload.title"]; }, '$.versions[0].targets["payload.title"]'],
      [(r) => { r.versions[0].targets["payload.extra"] = { const: 1 }; }, '$.versions[0].targets["payload.extra"]'],
      [(r) => { r.versions[0].targets["payload.title"] = { from: "heading", const: "x" }; }, '$.versions[0].targets["payload.title"]'],
      [(r) => { r.versions[0].targets["capture.subject"] = { const: "s", enum: { a: "b" } }; }, '$.versions[0].targets["capture.subject"].enum'],
      [(r) => { r.versions[0].targets["payload.title"] = { from: "heading", guess: true }; }, '$.versions[0].targets["payload.title"].guess'],
      [(r) => { r.versions[0].source.heading = "text"; }, '$.versions[0].source["heading"]'],
      [(r) => { r.versions[1].source.capture = "object"; }, '$.versions[1].source["capture.id"]'],
      [(r) => { r.versions[0].ignore = []; }, '$.versions[0].source["notes"]'],
      [(r) => { r.versions[0].ignore = ["notes", "missing"]; }, "$.versions[0].ignore[1]"],
      [(r) => { r.versions[0].targets["payload.status"] = { from: "state", enum: {} }; }, '$.versions[0].targets["payload.status"].enum'],
      [(r) => { r.versions[0].autoMigrate = true; }, "$.versions[0].autoMigrate"],
    ];
    for (const [fn, path] of cases) {
      const result = mutate(fn);
      assert.equal(result.ok, false, path);
      assert.ok(paths(result).includes(path), `${path} in ${JSON.stringify(paths(result))}`);
      for (const e of result.errors) {
        assert.equal(e.code, "mapping_invalid");
        assert.match(e.suggestedAction, /Correct the mapping registry/);
      }
    }
  });

  test("the endpoint refuses an invalid registry before evaluating or applying anything", () => {
    const ep = endpoint();
    const registry = clone(mappingRegistry());
    registry.versions[0].targets["payload.output"] = { from: "keyz" };
    const res = evaluate(ep, periodNRequest(), { registry });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, false);
    assert.deepEqual(res.body.records, []);
    assert.equal(res.body.configErrors[0].code, "mapping_invalid");
    assert.equal(res.body.configErrors[0].fieldPath, 'mappings.versions[0].targets["payload.output"].from');
    assert.equal(ep.externalEffects(), 0);
    assert.equal(ep.effects.commitCount(), 0);
  });

  test("an undeclared mappingVersion is mapping_version_unknown with the declared list", () => {
    const ep = endpoint();
    const request = periodNRequest();
    request.period.mappingVersion = "workflow-output.v9";
    const res = evaluate(ep, request);
    assert.equal(res.body.configErrors[0].code, "mapping_version_unknown");
    assert.equal(res.body.configErrors[0].fieldPath, "period.mappingVersion");
    assert.match(res.body.configErrors[0].message, /workflow-output\.v1, workflow-output\.v2/);
  });

  test("a malformed request names the field", () => {
    const ep = endpoint();
    const request = periodNRequest();
    delete request.period.taskId;
    const res = evaluate(ep, request);
    assert.deepEqual(res.body.configErrors.map((e) => [e.code, e.fieldPath]), [["request_invalid", "period.taskId"]]);
  });

  test("CLI validate: exit 0 on the packaged registry, exit 1 with paths on a bad file", () => {
    const bin = join(root, "bin/workflow-kits-n12-changed-period.mjs");
    const good = spawnSync(process.execPath, [bin, "validate"], { encoding: "utf8" });
    assert.equal(good.status, 0, good.stderr);
    assert.equal(JSON.parse(good.stdout).ok, true);
    const dir = mkdtempSync(join(tmpdir(), "wk-cp-validate-"));
    try {
      const bad = clone(mappingRegistry());
      delete bad.versions[1].source.priority;
      writeFileSync(join(dir, "bad.json"), JSON.stringify(bad));
      const res = spawnSync(process.execPath, [bin, "validate", join(dir, "bad.json")], { encoding: "utf8" });
      assert.equal(res.status, 1);
      assert.ok(JSON.parse(res.stdout).errors.some((e) => e.path === "$.versions[1].ignore[0]"));
      writeFileSync(join(dir, "notjson.json"), "{");
      assert.equal(spawnSync(process.execPath, [bin, "validate", join(dir, "notjson.json")]).status, 1);
      assert.equal(spawnSync(process.execPath, [bin, "nope"]).status, 2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
