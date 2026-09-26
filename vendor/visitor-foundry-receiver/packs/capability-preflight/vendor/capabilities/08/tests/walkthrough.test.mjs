import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  DEPENDS_ON,
  HEAVY_LANE_OWNED,
  SCHEMA,
  STAGE_ID,
  runInstallFirstResultWalkthrough,
  verifySuppliedArtifact,
  resolveDependencies,
  _resetDepsCacheForTests,
} from "../src/index.mjs";
import {
  stubBuildTaskRequirementsEnvelope,
  stubBuildCostDryRunComparison,
} from "../src/stubs/cap01_cap04.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const load = (name) => JSON.parse(readFileSync(join(root, "fixtures", name), "utf8"));

const CLOCK = () => Date.parse("2026-09-10T19:00:00.000Z");

const CAP05_SCHEMA = "pilot.r2.capabilities.failure_fallback_plan.v1";

function baseInput(overrides = {}) {
  return {
    taskId: "cap08-demo-install-first-result",
    requirements: load("requirements.json"),
    costInput: load("cost-input.json"),
    artifact: load("artifact.good.json"),
    discovery: { capabilityId: "extract_batch_json" },
    prerequisites: { prerequisites: ["node20", "offline_fixtures"] },
    ...overrides,
  };
}

function depsWithoutCap05(resolved) {
  return {
    ...resolved,
    cap05: {
      available: false,
      path: null,
      implementation: "stub",
      buildFailureFallbackPlan: null,
    },
  };
}

describe("R2-CAPABILITIES-08 thin walkthrough", () => {
  it("demo completes end-to-end offline with stage statuses", async () => {
    _resetDepsCacheForTests();
    const result = await runInstallFirstResultWalkthrough(baseInput(), { clock: CLOCK });

    assert.equal(result.schema, SCHEMA);
    assert.equal(result.dryRun, true);
    assert.equal(result.paidInstall, false);
    assert.equal(result.liveNetwork, false);
    assert.equal(result.thinEarlyPromote, true);
    assert.deepEqual(result.dependsOn, [...DEPENDS_ON]);
    assert.deepEqual(result.heavyLaneOwned, [...HEAVY_LANE_OWNED]);

    const ids = result.stages.map((s) => s.id);
    assert.deepEqual(ids, [
      STAGE_ID.DISCOVERY,
      STAGE_ID.PREREQUISITES,
      STAGE_ID.ENVELOPE,
      STAGE_ID.COST_DRY_RUN,
      STAGE_ID.VERIFY,
      STAGE_ID.FALLBACK_PLAN,
    ]);

    const discovery = result.stages.find((s) => s.id === STAGE_ID.DISCOVERY);
    assert.equal(discovery.implementation, "stub");
    assert.equal(discovery.heavyLaneOwned, "R2-CAPABILITIES-02");

    const prereq = result.stages.find((s) => s.id === STAGE_ID.PREREQUISITES);
    assert.equal(prereq.implementation, "stub");
    assert.equal(prereq.heavyLaneOwned, "R2-CAPABILITIES-03");

    const envelope = result.stages.find((s) => s.id === STAGE_ID.ENVELOPE);
    assert.ok(["cap01", "stub"].includes(envelope.implementation));
    assert.equal(envelope.dependsOn, "R2-CAPABILITIES-01");

    const cost = result.stages.find((s) => s.id === STAGE_ID.COST_DRY_RUN);
    assert.ok(["cap04", "stub"].includes(cost.implementation));
    assert.equal(cost.dependsOn, "R2-CAPABILITIES-04");
    assert.equal(cost.result.dryRun, true);
    assert.equal(cost.result.paidCalls, false);

    const verify = result.stages.find((s) => s.id === STAGE_ID.VERIFY);
    assert.equal(verify.implementation, "thin_local");
    assert.equal(verify.status, "ok");
    assert.equal(verify.result.ok, true);

    const fallback = result.stages.find((s) => s.id === STAGE_ID.FALLBACK_PLAN);
    assert.equal(fallback.optional, true);
    assert.ok(["not_run", "ok", "stub_ok", "failed"].includes(fallback.status));

    assert.ok(
      result.status === "ready" || result.status === "partial_input",
      `unexpected status ${result.status}`,
    );
  });

  it("when Cap05 present, fallback stage runs real plan schema", async () => {
    _resetDepsCacheForTests();
    const resolved = await resolveDependencies();
    assert.equal(
      resolved.cap05.available,
      true,
      "Cap05 sibling worktree expected for this deepen test",
    );
    assert.equal(resolved.cap05.implementation, "cap05");
    assert.equal(typeof resolved.cap05.buildFailureFallbackPlan, "function");

    const result = await runInstallFirstResultWalkthrough(baseInput({
      artifact: load("artifact.bad.json"),
    }), { clock: CLOCK, deps: resolved });

    const fallback = result.stages.find((s) => s.id === STAGE_ID.FALLBACK_PLAN);
    assert.equal(fallback.implementation, "cap05");
    assert.equal(fallback.status, "ok");
    assert.equal(fallback.plan?.schema, CAP05_SCHEMA);
    assert.equal(fallback.plan?.status, "ready");
    assert.equal(fallback.plan?.dryRun, true);
    assert.equal(fallback.plan?.paidCalls, false);
    assert.equal(fallback.plan?.liveExecution, false);
    assert.equal(fallback.plan?.failureClass, "validation");
    assert.equal(fallback.plan?.mutationState, "none");
    assert.ok(Array.isArray(fallback.plan?.steps));
    assert.ok(fallback.plan.steps.length > 0);
    assert.equal(result.stageImplementations.fallback_plan, "cap05");
  });

  it("when Cap05 absent, fallback stage stays not_run", async () => {
    _resetDepsCacheForTests();
    const resolved = await resolveDependencies();
    const deps = depsWithoutCap05(resolved);
    // Ensure Cap01/04 still usable even if we force stubs for isolation
    if (!deps.cap01.buildTaskRequirementsEnvelope) {
      deps.cap01 = {
        available: false,
        path: null,
        implementation: "stub",
        buildTaskRequirementsEnvelope: stubBuildTaskRequirementsEnvelope,
      };
    }
    if (!deps.cap04.buildCostDryRunComparison) {
      deps.cap04 = {
        available: false,
        path: null,
        implementation: "stub",
        buildCostDryRunComparison: stubBuildCostDryRunComparison,
      };
    }

    const result = await runInstallFirstResultWalkthrough(baseInput(), {
      clock: CLOCK,
      deps,
    });

    const fallback = result.stages.find((s) => s.id === STAGE_ID.FALLBACK_PLAN);
    assert.equal(fallback.implementation, "stub");
    assert.equal(fallback.status, "not_run");
    assert.equal(fallback.plan, null);
    assert.equal(result.stageImplementations.fallback_plan, "not_run (Cap05 absent)");
  });

  it("ambiguous mutation fixture never claims rolled_back true", async () => {
    _resetDepsCacheForTests();
    const resolved = await resolveDependencies();
    assert.equal(resolved.cap05.available, true);

    const result = await runInstallFirstResultWalkthrough(
      baseInput({
        artifact: load("artifact.bad.json"),
        failedOutcome: load("failed-outcome.ambiguous.json"),
      }),
      { clock: CLOCK, deps: resolved },
    );

    const fallback = result.stages.find((s) => s.id === STAGE_ID.FALLBACK_PLAN);
    assert.equal(fallback.implementation, "cap05");
    assert.equal(fallback.plan?.schema, CAP05_SCHEMA);
    assert.equal(fallback.plan?.mutationState, "ambiguous");
    assert.equal(fallback.plan?.mutationPreservation?.mutationState, "ambiguous");
    assert.equal(fallback.plan?.mutationPreservation?.preserveAmbiguity, true);
    assert.equal(fallback.plan?.mutationPreservation?.rolled_back, false);
    assert.equal(fallback.plan?.mutationPreservation?.sideEffectsClean, false);
    assert.notEqual(fallback.plan?.mutationPreservation?.rolled_back, true);
  });

  it("verification fails on bad artifact", async () => {
    _resetDepsCacheForTests();
    const result = await runInstallFirstResultWalkthrough(
      {
        requirements: load("requirements.json"),
        costInput: load("cost-input.json"),
        artifact: load("artifact.bad.json"),
      },
      { clock: CLOCK },
    );

    const verify = result.stages.find((s) => s.id === STAGE_ID.VERIFY);
    assert.equal(verify.status, "failed");
    assert.equal(verify.result.ok, false);
    assert.ok(verify.result.failures.length > 0);
    assert.equal(result.status, "failed");
    assert.equal(result.paidInstall, false);
    assert.equal(result.liveNetwork, false);
  });

  it("does not implement Cap02/03/06 beyond heavyLaneOwned stubs", async () => {
    _resetDepsCacheForTests();
    const result = await runInstallFirstResultWalkthrough(
      {
        requirements: load("requirements.json"),
        costInput: load("cost-input.json"),
        artifact: load("artifact.good.json"),
      },
      { clock: CLOCK },
    );

    const discovery = result.stages.find((s) => s.id === STAGE_ID.DISCOVERY);
    const prereq = result.stages.find((s) => s.id === STAGE_ID.PREREQUISITES);
    assert.equal(discovery.implementation, "stub");
    assert.equal(prereq.implementation, "stub");
    assert.ok(result.heavyLaneOwned.includes("R2-CAPABILITIES-02"));
    assert.ok(result.heavyLaneOwned.includes("R2-CAPABILITIES-03"));
    assert.ok(result.heavyLaneOwned.includes("R2-CAPABILITIES-06"));

    // Verify is thin_local, not Cap06
    const verify = result.stages.find((s) => s.id === STAGE_ID.VERIFY);
    assert.equal(verify.implementation, "thin_local");
    assert.match(verify.heavyLaneOwnedNote || verify.result.note || "", /R2-CAPABILITIES-06/);
  });

  it("thin verify helper rejects bad artifact against envelope constraints", async () => {
    _resetDepsCacheForTests();
    // Build a minimal envelope-shaped constraints object
    const envelope = {
      outputConstraints: {
        format: "json",
        requiredFields: ["sourceUrl", "evidenceDigest"],
        objectiveChecks: [
          {
            id: "source_https",
            check: { kind: "https_url_shape", path: "sourceUrl" },
          },
        ],
      },
    };
    const bad = verifySuppliedArtifact(load("artifact.bad.json"), envelope);
    assert.equal(bad.ok, false);
    assert.equal(bad.status, "failed");
    assert.ok(bad.failures.length > 0);

    const good = verifySuppliedArtifact(load("artifact.good.json"), envelope);
    assert.equal(good.ok, true);
    assert.equal(good.status, "ok");
  });

  it("json_path_equals uses check.equals; missing path does not match absent value", () => {
    const envelope = {
      outputConstraints: {
        requiredFields: [],
        objectiveChecks: [
          {
            id: "loc_eq",
            check: { kind: "json_path_equals", path: "location", equals: "/tmp/data" },
          },
        ],
      },
    };
    const missing = verifySuppliedArtifact({}, envelope);
    assert.equal(missing.ok, false);
    assert.ok(missing.failures.includes("missing:location"), JSON.stringify(missing.failures));

    const wrong = verifySuppliedArtifact({ location: "/var/other" }, envelope);
    assert.equal(wrong.ok, false);
    assert.ok(wrong.failures.includes("equals:location"), JSON.stringify(wrong.failures));

    const correct = verifySuppliedArtifact({ location: "/tmp/data" }, envelope);
    assert.equal(correct.ok, true);
    assert.equal(correct.status, "ok");

    const valueAliasDoesNotPass = verifySuppliedArtifact(
      {},
      {
        outputConstraints: {
          requiredFields: [],
          objectiveChecks: [
            {
              id: "bogus_value",
              check: { kind: "json_path_equals", path: "absent", value: undefined },
            },
          ],
        },
      },
    );
    assert.equal(valueAliasDoesNotPass.ok, false);
    assert.ok(
      valueAliasDoesNotPass.failures.includes("missing:absent") ||
        valueAliasDoesNotPass.failures.includes("equals_missing:absent"),
      JSON.stringify(valueAliasDoesNotPass.failures),
    );
  });
});
