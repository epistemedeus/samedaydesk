import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { computeEffort } from "../scripts/compute-effort.mjs";
import { serialize } from "../scripts/build-artifacts.mjs";
import { artifactDigests } from "../src/artifacts.mjs";
import { COMPARISON_ROWS } from "../src/vendor-paths.mjs";
import { readJson, readText } from "./helpers.mjs";

const effort = readJson("EFFORT.json");
const pins = readJson("vendor/PINS.json");

describe("EFFORT.json", () => {
  test("equals the computed output (compute-effort --check)", () => {
    assert.equal(readText("EFFORT.json"), serialize(computeEffort()));
  });

  test("artifact hashes match the committed files", () => {
    const digests = artifactDigests();
    for (const name of ["make", "n8n"]) assert.equal(effort.artifacts[name].sha256, digests[name].sha256);
  });

  test("adaptation from v1 to v2 is one embedded registry edit per artifact and 21 declared field edits", () => {
    assert.equal(effort.registryDiff.fieldEdits, 21);
    assert.deepEqual(effort.artifactLeafEdits.make, ["$.flow.1.mapper.value"]);
    assert.deepEqual(effort.artifactLeafEdits.n8n, ["$.nodes.2.parameters.assignments.assignments.0.value"]);
    for (const route of ["make", "n8n", "direct"]) {
      const row = effort.rows[route];
      assert.equal(row.review.exceptionsSurfaced, 18);
      assert.equal(row.review.autoRecoveredBySameKeyReplay, 1);
      assert.equal(row.review.reviewItems, 17);
      assert.equal(row.total, row.mapping.declaredTargets + row.mapping.wiringReferences + row.adaptation.registryFieldEdits + row.adaptation.artifactLeafEdits + row.adaptation.requestFieldEdits + row.review.reviewItems);
    }
  });

  test("native numbers are measured or cited at the pinned source, never summed into a fake total", () => {
    const native = effort.rows.native;
    assert.equal(native.total, null);
    assert.equal(native.adaptation.supported, false);
    assert.equal(native.mapping.source.sha, pins.sources.find((s) => s.name === "recurring-journey").sha);
    assert.match(readText("vendor/payment-rail/recurring-journey/journey.mjs").split("\n")[native.mapping.source.line - 1], /requiredFields = \["title", "status", "output"\]/);
    assert.match(readText("vendor/payment-rail/recurring-journey/README.md").split("\n")[native.adaptation.source.line - 1], /auto-migration of the later-period schema-change fixture/);
    assert.equal(native.steps.value, COMPARISON_ROWS.native.steps);
    assert.equal(native.steps.source.sha, pins.stack.find((s) => s.pull === 687).head);
  });

  test("README effort table matches EFFORT.json", () => {
    const readme = readText("README.md");
    for (const [label, route] of [["Make", "make"], ["n8n", "n8n"], ["direct", "direct"]]) {
      const r = effort.rows[route];
      const line = `| ${label} | ${r.mapping.declaredTargets} | ${r.mapping.wiringReferences} | ${r.adaptation.registryFieldEdits} | ${r.adaptation.artifactLeafEdits} | ${r.adaptation.requestFieldEdits} | ${r.review.reviewItems} | ${r.total} |`;
      assert.ok(readme.includes(line), line);
    }
  });

  test("the simulation section records identical final receipts and no double apply", () => {
    assert.equal(effort.simulation.finalReceiptsEqual, true);
    for (const route of ["make", "n8n", "direct"]) {
      assert.equal(effort.simulation.routes[route].maxAppliesPerKey, 1);
      assert.equal(effort.simulation.routes[route].externalEffects, 7);
    }
  });
});
