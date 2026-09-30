import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { factsFrom, judge, requireFact, PRODUCTION_ACTIVATE } from "../foundry/activation/classify.mjs";
import { assessPreconditions } from "../foundry/activation/preconditions.mjs";

const accept = fileURLToPath(new URL("../foundry/activation/postdeploy-accept.mjs", import.meta.url));
const rollback = fileURLToPath(new URL("../foundry/activation/rollback.mjs", import.meta.url));
const falseGreen = fileURLToPath(new URL("../foundry/activation/fixtures/seeded-false-green.json", import.meta.url));
const noRestart = fileURLToPath(new URL("../foundry/activation/fixtures/seeded-task-without-restart.json", import.meta.url));
const disabled = fileURLToPath(new URL("../foundry/activation/fixtures/disabled-mount.json", import.meta.url));

function cli(script, args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
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
  visitorEntry: { status: 200, hasProfile: true },
  uploads: { status: 501 },
  task: null,
  retrieval: null,
};

const portable = { outcome: "observed", payload: { project: { id: "prj_later_alpha", status: "open", version: 1 } } };

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
    hostedDiscovery: false,
    taskResult: false,
    durableRetrieval: false,
  });

  const found = factsFrom(discovery);
  assert.equal(found.hostedDiscovery, true);
  assert.equal(found.taskResult, false);
  assert.equal(found.disabledOptionalMount, false);

  const taskOnly = factsFrom({
    ...discovery,
    task: { published: true, candidateId: "cand-local", output: portable, expected: portable },
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
    task: { published: true, candidateId: "cand-local", output: portable, expected: portable },
    retrieval: { processRestarted: true, databaseSurvived: true, sameCandidate: true, output: portable },
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
