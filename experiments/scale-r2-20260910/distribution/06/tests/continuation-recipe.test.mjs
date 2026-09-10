import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  ERROR_CODES,
  RECIPE_SCHEMA,
  RECIPE_STATUS,
  REQUIRED_REUSE_POLICY,
  USEFUL_JOB_KINDS,
  assertCaptureDistinct,
  assertOptInNoBroadcast,
  buildContinuationRecipe,
  validateJob,
  validateRecipe,
} from "../src/index.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const load = (name) => JSON.parse(readFileSync(join(root, "fixtures", name), "utf8"));
const clock = () => Date.parse("2026-09-10T20:00:00.000Z");

test("positive: source_change_evidence_pack recipe available with opt-in and no broadcast", () => {
  const recipe = buildContinuationRecipe(load("job.positive.json"), { clock });
  assert.equal(recipe.schema, RECIPE_SCHEMA);
  assert.equal(recipe.status, RECIPE_STATUS.AVAILABLE);
  assert.equal(recipe.generatedAt, "2026-09-10T20:00:00.000Z");
  assert.equal(recipe.jobRef.kind, USEFUL_JOB_KINDS.SOURCE_CHANGE_EVIDENCE_PACK);
  assert.match(recipe.jobRef.evidencePath, /receipts-grexal-s149\.json/);
  assert.match(recipe.jobRef.sourcePath, /grexal\/package/);
  assert.equal(recipe.reusePolicy.optInRequired, true);
  assert.equal(recipe.reusePolicy.broadcast, false);
  assert.equal(recipe.reusePolicy.optInRequired, REQUIRED_REUSE_POLICY.optInRequired);
  assert.ok(recipe.afterDeliveryStep.includes("opt-in"));
  assert.ok(Array.isArray(recipe.commands) && recipe.commands.length >= 1);
  for (const c of recipe.commands) {
    assert.equal(c.optInRequired, true);
    assert.equal(c.broadcast, false);
  }
  assert.equal(recipe.priorDeliveryCount, 1);
  assert.equal(recipe.marketplaceHints.listingStatus, "PUBLIC_ACTIVE");
  assert.equal(recipe.marketplaceHints.agentId, "j970cajvv6wbrmy64s2f4ajzw18e5j2q");
  assert.equal(recipe.marketplaceHints.pricingRunCompletedUsd, 0.02);
  assert.equal(recipe.marketplaceHints.estimateReserveIsCharge, false);
  assert.equal(recipe.marketplaceHints.customerExecutionRevenuePayout, false);
  assert.equal(recipe.mutationBoundary.executesProviderMutations, false);
  assert.equal(assertOptInNoBroadcast(recipe), true);
  validateRecipe(recipe);
});

test("positive alternate: agensi_provenance_compare useful job", () => {
  const recipe = buildContinuationRecipe(load("job.agensi-provenance.json"), { clock });
  assert.equal(recipe.status, RECIPE_STATUS.AVAILABLE);
  assert.equal(recipe.jobRef.kind, USEFUL_JOB_KINDS.AGENSI_PROVENANCE_COMPARE);
  assert.equal(recipe.reusePolicy.optInRequired, true);
  assert.equal(recipe.reusePolicy.broadcast, false);
  assert.ok(recipe.commands.length >= 1);
  validateRecipe(recipe);
});

test("negative: broadcast:true rejected", () => {
  assert.throws(
    () => validateJob(load("job.broadcast.json")),
    (err) => err.code === ERROR_CODES.FORBIDDEN_BROADCAST,
  );
  assert.throws(
    () => buildContinuationRecipe(load("job.broadcast.json"), { clock }),
    (err) => err.code === ERROR_CODES.FORBIDDEN_BROADCAST,
  );
});

test("negative: optInRequired:false rejected", () => {
  assert.throws(
    () => validateJob(load("job.opt-in-false.json")),
    (err) => err.code === ERROR_CODES.FORBIDDEN_OPT_IN,
  );
  assert.throws(
    () => buildContinuationRecipe(load("job.opt-in-false.json"), { clock }),
    (err) => err.code === ERROR_CODES.FORBIDDEN_OPT_IN,
  );
});

test("negative: generic version_alert job kind rejected", () => {
  assert.throws(
    () => validateJob(load("job.generic-kind.json")),
    (err) => err.code === ERROR_CODES.FORBIDDEN_JOB_KIND,
  );
  assert.throws(
    () => buildContinuationRecipe(load("job.generic-kind.json"), { clock }),
    (err) => err.code === ERROR_CODES.FORBIDDEN_JOB_KIND,
  );
});

test("negative: forbidden broadcastAudience / buyerCount fields rejected", () => {
  assert.throws(
    () => validateJob(load("job.malformed.json")),
    (err) =>
      err.code === ERROR_CODES.FORBIDDEN_BROADCAST ||
      err.code === ERROR_CODES.FORBIDDEN_CLAIM,
  );
});

test("partial: missing jobRef / reusePolicy → blocked_missing_input", () => {
  const recipe = buildContinuationRecipe(load("job.partial.json"), { clock });
  assert.equal(recipe.status, RECIPE_STATUS.BLOCKED_MISSING_INPUT);
  assert.equal(recipe.code, ERROR_CODES.BLOCKED_MISSING_INPUT);
  assert.ok(recipe.missingInputs.some((m) => m.includes("jobRef")));
  assert.ok(
    recipe.missingInputs.some(
      (m) => m.includes("reusePolicy") || m.includes("optIn"),
    ),
  );
  assert.equal(recipe.commands.length, 0);
  validateRecipe(recipe);
});

test("unavailable: prior delivery capture failed omits priorDeliveryCount", () => {
  const recipe = buildContinuationRecipe(load("job.unavailable.json"), { clock });
  assert.equal(recipe.status, RECIPE_STATUS.UNAVAILABLE);
  assert.equal(recipe.code, ERROR_CODES.UNAVAILABLE);
  assert.equal(
    Object.prototype.hasOwnProperty.call(recipe, "priorDeliveryCount"),
    false,
  );
  assert.equal(recipe.reusePolicy.optInRequired, true);
  assert.equal(recipe.reusePolicy.broadcast, false);
  validateRecipe(recipe);
});

test("no_users: capture ok with zero prior deliveries", () => {
  const recipe = buildContinuationRecipe(load("job.no-users.json"), { clock });
  assert.equal(recipe.status, RECIPE_STATUS.NO_USERS);
  assert.equal(recipe.code, ERROR_CODES.NO_USERS);
  assert.equal(recipe.priorDeliveryCount, 0);
  assert.equal(recipe.reusePolicy.optInRequired, true);
  assert.equal(recipe.reusePolicy.broadcast, false);
  validateRecipe(recipe);
});

test("unavailable ≠ no_users", () => {
  const unavailable = buildContinuationRecipe(load("job.unavailable.json"), { clock });
  const noUsers = buildContinuationRecipe(load("job.no-users.json"), { clock });
  assert.equal(assertCaptureDistinct(unavailable, noUsers), true);
  assert.notEqual(unavailable.status, noUsers.status);
  assert.notEqual(unavailable.code, noUsers.code);
  assert.equal(
    Object.prototype.hasOwnProperty.call(unavailable, "priorDeliveryCount"),
    false,
  );
  assert.equal(noUsers.priorDeliveryCount, 0);
});

test("validateRecipe rejects available recipe with broadcast true", () => {
  const recipe = buildContinuationRecipe(load("job.positive.json"), { clock });
  const poisoned = {
    ...recipe,
    reusePolicy: { optInRequired: true, broadcast: true },
  };
  assert.throws(
    () => validateRecipe(poisoned),
    (err) => err.code === ERROR_CODES.FORBIDDEN_BROADCAST,
  );
});

test("validateRecipe rejects available recipe with optInRequired false", () => {
  const recipe = buildContinuationRecipe(load("job.positive.json"), { clock });
  const poisoned = {
    ...recipe,
    reusePolicy: { optInRequired: false, broadcast: false },
  };
  assert.throws(
    () => validateRecipe(poisoned),
    (err) => err.code === ERROR_CODES.FORBIDDEN_OPT_IN,
  );
});

test("validateRecipe rejects collapsed unavailable-as-no_users label", () => {
  const unavailable = buildContinuationRecipe(load("job.unavailable.json"), { clock });
  const collapsed = {
    ...unavailable,
    labels: { collapsedUnavailableAsNoUsers: true },
  };
  assert.throws(
    () => validateRecipe(collapsed),
    (err) => err.code === ERROR_CODES.INVALID_INPUT,
  );
});

test("jobRef without evidence/source path rejected", () => {
  const bare = {
    schema: "pilot.r2.distribution.continuation_job.v1",
    cite: "bare jobRef",
    captureStatus: "ok",
    priorDeliveryCount: 1,
    jobRef: { kind: "source_change_evidence_pack" },
    reusePolicy: { optInRequired: true, broadcast: false },
  };
  assert.throws(
    () => validateJob(bare),
    (err) => err.code === ERROR_CODES.MISSING_REQUIREMENT,
  );
});

test("commands on available recipe always carry opt-in and no-broadcast", () => {
  const recipe = buildContinuationRecipe(load("job.positive.json"), { clock });
  assert.ok(recipe.commands.every((c) => c.optInRequired === true && c.broadcast === false));
  assert.equal(recipe.reuseGate.requiresExplicitOptIn, true);
  assert.equal(recipe.reuseGate.allowsUnsolicitedBroadcast, false);
});
