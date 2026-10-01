import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { hash } from "../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/capabilities/src/contracts.mjs";
import { SCHEMA, contributionProfile, profile } from "../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/entry/src/contract.mjs";
import { entryBinding, hostProfile } from "../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/entry/profile.mjs";
import { factsFrom, judge, requireFact, PRODUCTION_ACTIVATE } from "../foundry/activation/classify.mjs";
import { judgePublicClient } from "../foundry/activation/client-contract.mjs";
import { bootFoundryServer } from "../foundry/activation/local-journey.mjs";
import { observeOrigin } from "../foundry/activation/observe.mjs";
import { assessPreconditions } from "../foundry/activation/preconditions.mjs";
import { invocationSelectsCandidate } from "../foundry/activation/wire-contract.mjs";

const runtimePython = fileURLToPath(new URL("../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution/.runtime/bin/python", import.meta.url));
if (!existsSync(runtimePython)) {
  const setup = spawnSync("python3", ["vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution/setup-runtime.py"], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    encoding: "utf8",
  });
  if (setup.status !== 0) throw new Error(`wasmtime runtime setup failed: ${setup.stderr || ""}`);
}

const accept = fileURLToPath(new URL("../foundry/activation/postdeploy-accept.mjs", import.meta.url));
const rollback = fileURLToPath(new URL("../foundry/activation/rollback.mjs", import.meta.url));
const falseGreen = fileURLToPath(new URL("../foundry/activation/fixtures/seeded-false-green.json", import.meta.url));
const noRestart = fileURLToPath(new URL("../foundry/activation/fixtures/seeded-task-without-restart.json", import.meta.url));
const disabled = fileURLToPath(new URL("../foundry/activation/fixtures/disabled-mount.json", import.meta.url));

function cli(script, args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
}

function canonicalEntry() {
  const options = JSON.parse(readFileSync(new URL("../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/entry/private-profile.example.json", import.meta.url), "utf8"));
  const hostOptions = JSON.parse(readFileSync(new URL("../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/entry/host-profile.example.json", import.meta.url), "utf8"));
  const binding = entryBinding(hostProfile(hostOptions));
  const body = {
    schema: SCHEMA,
    profile: contributionProfile(profile(options), { id: "vf10:contribution-v2", binding }),
    availability: "available",
    remainingEnrollments: 11,
    receiver: binding.receiverId,
    clientContract: SCHEMA,
    nextAction: "persist_attempt_then_register",
  };
  return { status: 200, schema: body.schema, bindingSchema: binding.schema, body };
}

const portable = { outcome: "observed", payload: { project: { id: "prj_later_alpha", status: "open", version: 1 } } };

function portableTask(candidateId = "candidate:original") {
  const input = {
    structuredContent: { event: { id: "evt_original", kind: "artifact" }, replayed: false },
    content: [{ type: "text", text: "redundant rendering" }],
  };
  const request = {
    schema: "neomorphic.foundry.capability-request.v1",
    taskId: "task:visitor-a",
    outcome: "compact-correspondence-structured-result",
    input,
    environment: { platform: "linux", arch: "x64", executionProfile: "vf08.wasmtime49-linux-x64-fixed.v1" },
    output: null,
    capabilityId: null,
  };
  const target = { capabilityId: "capability:fixture", version: "1", contentId: `sha256:${"ab".repeat(32)}` };
  const invocation = {
    schema: "neomorphic.foundry.invocation.v1",
    target,
    taskId: request.taskId,
    manifestId: `sha256:${"cd".repeat(32)}`,
    inputDigest: hash(input),
    output: portable,
    invokedAt: "2026-09-30T23:04:53.000Z",
    outcome: "observed_output",
    purpose: "owner_qa",
    relationship: "owner",
    cost: null,
    effortMs: null,
    beneficiaryGrantId: "grant:fixture",
    environmentDigest: `sha256:${"ef".repeat(32)}`,
    executionObservation: "observation:fixture",
  };
  return { published: true, candidateId, output: portable, expected: portable, request, invocation };
}

function readbackFor(task, candidateId, contentHex) {
  const contentId = `sha256:${contentHex.repeat(32)}`;
  const target = { ...task.invocation.target, contentId };
  const invocation = { ...task.invocation, target, output: portable };
  return {
    invocation,
    manifestId: invocation.manifestId,
    manifestTarget: target,
    manifestRequestId: hash(task.request),
    taskId: task.request.taskId,
    inputDigest: hash(task.request.input),
    requestDigest: hash(task.request),
    executionCandidateId: candidateId,
    executionGeneration: 1,
    executionTarget: target,
    contributed: { candidateId, generation: 1, contentId, target },
  };
}

const discovery = {
  productionActivate: "HOLD",
  sdsHealth: { status: 200, service: "samedaydesk", ok: true },
  correspondenceHealthz: { status: 200, body: { ok: true, enabled: true, store: "postgres" } },
  foundryReceiver: {
    status: 200,
    body: {
      optIn: true,
      facade: true,
      rawMounted: false,
      publicExecution: false,
      extension: true,
      schema: "pilot_correspondence",
      wholeHostSandbox: false,
    },
  },
  visitorEntry: canonicalEntry(),
  uploads: { status: 501 },
  task: null,
  retrieval: null,
};

test("production activation stays HOLD", () => {
  assert.equal(PRODUCTION_ACTIVATE, "HOLD");
  const empty = assessPreconditions({});
  assert.equal(empty.productionActivate, "HOLD");
  assert.equal(empty.productionReady, false);
  assert.equal(empty.startupMigrates, false);
  assert.ok(empty.shapeBlockers.includes("installer_evidence_absent"));
  assert.ok(empty.shapeBlockers.includes("schema_not_pilot_correspondence"));
  const complete = assessPreconditions({
    FOUNDRY_PRODUCTION_ACTIVATE: "HOLD",
    FOUNDRY_HOST_OPT_IN: "1",
    CORRESPONDENCE_DATABASE_URL: "postgres://db.example:5432/correspondence",
    CORRESPONDENCE_PG_SCHEMA: "pilot_correspondence",
    CORRESPONDENCE_ADMIN_TOKEN: "x".repeat(24),
    CORRESPONDENCE_STORE: "postgres",
    CORRESPONDENCE_POOL_MAX: "2",
    FOUNDRY_HOST_PROFILE_FILE: "/secure/host-profile.json",
    FOUNDRY_PARTICIPATION_KEY_FILE: "/secure/participation.key",
    FOUNDRY_PRIVATE_PROFILE_FILE: "/secure/private-profile.json",
  }, {
    installer: { installed: true, schema: "pilot_correspondence", startupMigrates: false },
  });
  assert.equal(complete.shapeComplete, true);
  assert.equal(complete.productionReady, false);
  assert.deepEqual(complete.blockers, []);
  const released = assessPreconditions({ FOUNDRY_PRODUCTION_ACTIVATE: "GO" });
  assert.equal(released.productionReady, false);
  assert.ok(released.blockers.includes("production_activate_not_hold"));
});

test("classifier keeps the four states distinct", () => {
  const healthOnly = factsFrom({
    sdsHealth: { status: 200, service: "samedaydesk", ok: true },
    correspondenceHealthz: { status: 200, body: { ok: false, enabled: false, reason: "unconfigured" } },
    foundryReceiver: { status: 503, body: null },
    visitorEntry: { status: 503, hasProfile: false },
    uploads: { status: 501 },
    publicCatalog: { status: 200 },
    task: null,
    retrieval: null,
  });
  assert.deepEqual(healthOnly, {
    disabledOptionalMount: true,
    degradedMount: false,
    degradedReason: null,
    hostedDiscovery: false,
    taskResult: false,
    durableRetrieval: false,
  });

  const found = factsFrom(discovery);
  assert.equal(found.hostedDiscovery, true);
  assert.equal(found.taskResult, false);
  assert.equal(found.disabledOptionalMount, false);

  const earned = portableTask("candidate:original");
  const taskOnly = factsFrom({
    ...discovery,
    task: earned,
    retrieval: { processRestarted: false, databaseSurvived: true, sameCandidate: true, output: portable },
  });
  assert.equal(taskOnly.taskResult, true);
  assert.equal(taskOnly.durableRetrieval, false);

  const healthAsTask = factsFrom({
    ...discovery,
    task: {
      published: true,
      candidateId: "cand-local",
      output: { ok: true, service: "samedaydesk" },
      expected: { ok: true, service: "samedaydesk" },
    },
  });
  assert.equal(healthAsTask.taskResult, false);

  const durable = factsFrom({
    ...discovery,
    task: earned,
    retrieval: {
      processRestarted: true,
      databaseSurvived: true,
      output: portable,
      readback: readbackFor(earned, "candidate:original", "ab"),
    },
  });
  assert.equal(durable.durableRetrieval, true);
  assert.equal(durable.disabledOptionalMount, false);
});

test("seeded false green is rejected by the acceptance command", () => {
  const gone = cli(accept, ["--fixture", falseGreen]);
  assert.equal(gone.status, 2, gone.stdout + gone.stderr);
  const body = JSON.parse(gone.stdout);
  assert.equal(body.code, "false_green_rejected");
  assert.equal(body.productionActivate, "HOLD");
  assert.equal(body.reason, "durable_claim_without_retrieval");
  assert.equal(body.facts.disabledOptionalMount, true);
  assert.equal(body.facts.hostedDiscovery, false);

  const restarted = cli(accept, ["--fixture", noRestart]);
  assert.equal(restarted.status, 2, restarted.stdout);
  const restartBody = JSON.parse(restarted.stdout);
  assert.equal(restartBody.code, "false_green_rejected");
  assert.equal(restartBody.reason, "durable_claim_without_retrieval");
  assert.equal(restartBody.facts.taskResult, true);
  assert.equal(restartBody.facts.durableRetrieval, false);

  const held = cli(accept, ["--fixture", disabled, "--require", "disabled"]);
  assert.equal(held.status, 0, held.stdout);
  assert.equal(JSON.parse(held.stdout).facts.disabledOptionalMount, true);

  const activated = judge({ ...discovery, productionActivate: "GO", claims: {
    disabledOptionalMount: false, hostedDiscovery: true, taskResult: false, durableRetrieval: false,
  } });
  assert.equal(activated.exitCode, 2);
  assert.equal(activated.reason, "production_activate_not_hold");

  const unmet = requireFact(discovery, "task");
  assert.equal(unmet.exitCode, 1);
  assert.equal(unmet.code, "acceptance_unmet");
  assert.equal(unmet.reason, "taskResult");
});

test("rollback procedure does not apply production changes", () => {
  const shown = cli(rollback, []);
  assert.equal(shown.status, 0, shown.stderr);
  const body = JSON.parse(shown.stdout);
  assert.equal(body.productionActivate, "HOLD");
  assert.equal(body.applied, false);
  assert.equal(body.schemaDropped, false);
  assert.equal(body.code, "rollback_procedure");
  const refused = cli(rollback, ["--apply"]);
  assert.equal(refused.status, 2);
  const refusal = JSON.parse(refused.stdout);
  assert.equal(refusal.applied, false);
  assert.equal(refusal.reason, "production_activate_not_hold");
  assert.equal(refusal.productionActivate, "HOLD");
});

test("degraded correspondence states are not a successful disabled mount", () => {
  const shell = {
    productionActivate: "HOLD",
    sdsHealth: { status: 200, service: "samedaydesk", ok: true },
    foundryReceiver: { status: 503, body: null },
    visitorEntry: { status: 503, body: null },
    uploads: { status: 501 },
    task: null,
    retrieval: null,
  };
  for (const reason of ["invalid_config", "store_unavailable"]) {
    const observation = {
      ...shell,
      correspondenceHealthz: { status: 200, body: { ok: false, enabled: false, reason, store: null } },
    };
    assert.equal(observation.claims, undefined);
    assert.equal(observation.hostConfiguration, undefined);
    const required = requireFact(observation, "disabled");
    assert.equal(required.ok, false);
    assert.equal(required.exitCode, 1);
    assert.equal(required.code, "degraded_mount");
    assert.equal(required.reason, reason);
    assert.equal(required.facts.disabledOptionalMount, false);
  }
  const unconfigured = requireFact({
    ...shell,
    correspondenceHealthz: { status: 200, body: { ok: false, enabled: false, reason: "unconfigured", store: null } },
  }, "disabled");
  assert.equal(unconfigured.ok, true);
  assert.equal(unconfigured.facts.disabledOptionalMount, true);
});

test("database namespace and equivalent output do not prove wire identity", () => {
  const lookalike = factsFrom({
    ...discovery,
    visitorEntry: {
      status: 200,
      schema: "pilot_correspondence",
      body: { schema: "pilot_correspondence", profile: { profileId: "vf10:contribution-v2", termsHash: "sha256:" + "aa".repeat(32) } },
    },
  });
  assert.equal(lookalike.hostedDiscovery, false);

  const missing = factsFrom({ ...discovery, visitorEntry: { status: 200, hasProfile: true } });
  assert.equal(missing.hostedDiscovery, false);

  const wrongBinding = structuredClone(discovery);
  wrongBinding.visitorEntry.body.profile.contribution.binding.schema = "pilot_correspondence";
  assert.equal(factsFrom(wrongBinding).hostedDiscovery, false);

  const earned = portableTask("candidate:original");
  const wrongInvocation = structuredClone(earned);
  wrongInvocation.invocation.schema = "pilot_correspondence";
  assert.equal(factsFrom({ ...discovery, task: wrongInvocation }).taskResult, false);

  const wrongRequest = structuredClone(earned);
  wrongRequest.request.schema = "pilot_correspondence";
  assert.equal(factsFrom({ ...discovery, task: wrongRequest }).taskResult, false);

  const substitute = readbackFor(earned, "candidate:substitute", "bb");
  const oldGreen = substitute.invocation.output.outcome === earned.expected.outcome
    && JSON.stringify(substitute.invocation.output) === JSON.stringify(earned.expected);
  assert.equal(oldGreen, true);
  assert.equal(invocationSelectsCandidate(substitute, earned.request, "candidate:original"), false);
  const substituted = factsFrom({
    ...discovery,
    task: earned,
    retrieval: {
      processRestarted: true,
      databaseSurvived: true,
      sameCandidate: true,
      output: portable,
      readback: substitute,
    },
  });
  assert.equal(substituted.taskResult, true);
  assert.equal(substituted.durableRetrieval, false);
  const unmet = requireFact({
    ...discovery,
    task: earned,
    retrieval: substituted.durableRetrieval ? null : {
      processRestarted: true,
      databaseSurvived: true,
      sameCandidate: true,
      output: portable,
      readback: substitute,
    },
  }, "durable");
  assert.equal(unmet.ok, false);
  assert.equal(unmet.code, "acceptance_unmet");
});

test("live disabled acceptance distinguishes unconfigured from degraded mounts", async () => {
  function servingEnv(extra = {}) {
    return {
      PATH: process.env.PATH || "",
      HOME: process.env.HOME || "",
      LANG: "C",
      LC_ALL: "C",
      NODE_ENV: "production",
      PORT: "0",
      SUPABASE_URL: "https://local-baseline.example",
      SUPABASE_SERVICE_ROLE_KEY: "local-baseline-stub",
      STRIPE_SECRET_KEY: "local-baseline-stub",
      RESEND_API_KEY: "local-baseline-stub",
      ...extra,
    };
  }
  async function waitReason(origin, reason) {
    const deadline = Date.now() + 15000;
    let last = null;
    while (Date.now() < deadline) {
      const response = await fetch(`${origin}/api/correspondence/healthz`);
      last = await response.json();
      if (last.reason === reason && response.status === 200) return last;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`healthz stayed ${JSON.stringify(last)}`);
  }
  const cases = [
    { reason: "unconfigured", env: servingEnv(), status: 0, code: "classified" },
    {
      reason: "invalid_config",
      env: servingEnv({ CORRESPONDENCE_DATABASE_URL: "postgres://127.0.0.1:9/correspondence" }),
      status: 1,
      code: "degraded_mount",
    },
    {
      reason: "store_unavailable",
      env: servingEnv({
        CORRESPONDENCE_DATABASE_URL: "postgres://sds@127.0.0.1:1/correspondence",
        CORRESPONDENCE_ADMIN_TOKEN: "b".repeat(24),
        CORRESPONDENCE_PG_SCHEMA: "pilot_correspondence",
        CORRESPONDENCE_STORE: "postgres",
      }),
      status: 1,
      code: "degraded_mount",
    },
  ];
  for (const item of cases) {
    const server = await bootFoundryServer(item.env);
    try {
      await waitReason(server.origin, item.reason);
      const ran = cli(accept, ["--origin", server.origin, "--require", "disabled"]);
      assert.equal(ran.status, item.status, ran.stdout + ran.stderr);
      const body = JSON.parse(ran.stdout);
      assert.equal(body.code, item.code);
      assert.equal(body.productionActivate, "HOLD");
      assert.equal(body.claims, undefined);
      if (item.reason === "unconfigured") assert.equal(body.facts.disabledOptionalMount, true);
      else {
        assert.equal(body.reason, item.reason);
        assert.equal(body.facts.disabledOptionalMount, false);
        assert.equal(body.facts.degradedReason, item.reason);
      }
      const client = judgePublicClient(await observeOrigin(server.origin));
      assert.equal(client.productionActivate, "HOLD");
      if (item.reason === "unconfigured") {
        assert.equal(client.ok, true, JSON.stringify(client));
        assert.equal(client.code, "public_client_compatible_foundry_inactive");
      } else {
        assert.equal(client.ok, false, JSON.stringify(client));
        assert.equal(client.code, "degraded_mount");
        assert.equal(client.reason, item.reason);
      }
      assert.equal(JSON.stringify(client).includes("local-baseline-stub"), false);
      assert.equal(ran.stdout.includes("local-baseline-stub"), false);
    } finally {
      await server.stop();
    }
  }
});
