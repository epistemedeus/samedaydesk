import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, test } from "node:test";

import { canonicalJson, jsonBodySha256 } from "../buyer/request-contract.mjs";
import { replayLaterPeriod, runRecordToAcceptedOutput } from "./journey.mjs";
import {
  agentEntryCaller,
  CLOCK,
  periodNCapture,
  periodNPlus1Preview,
  periodNPlus1Same,
  termsInputFromCaller,
  usefulDelivery,
  workExchangeCaller,
} from "./fixtures/load-synthetic-recurring.mjs";
import {
  bindOwedReferenceToJourney,
  consumeOwedReference,
  OWED_REFERENCE_CODES,
  owedReferenceV2Digest,
} from "./owed-reference.mjs";
import { CONTINUITY_RETRYABLE } from "./quote-continuity.mjs";

// Fixture values copied exactly from epistemedeus/pilot@527f69a8,
// tools/ops/agent-money/fixtures/walletless-owed-reference.v2.synthetic.json and
// walletless-owed-reference.synthetic.json. The recompute rule is
// tools/ops/agent-money/walletless-earned-claim.contract.mjs lines 620 to 636.
const FIXTURE_DIGEST = "212a845ae061b59fa1920c50a36a539bbfab64618fb532ff3ccee972cc5a4264";
const SORTED_DIGEST = "6202d2b46f241b7c30dc41455ee2fcb24a67e1f12312f3c88564fb652fad078b";
const FIXTURE_TASK_REF = "ae:corr:v1:n12WalletlessClaim0001";

function v1Fixture() {
  return {
    schema: "pilot.agent-money.owed-reference.v1",
    synthetic: true,
    obligationId: "syn-oblig-walletless-0001",
    taskRef: FIXTURE_TASK_REF,
    integrity: "2b6113075c5f2b597a50462ceec384965280262b3fd0cc5d186a17763f9a3a71",
    state: "owed",
  };
}

function v2Fixture() {
  return {
    schema: "pilot.agent-money.owed-reference.v2",
    synthetic: true,
    obligationId: "syn-oblig-walletless-0001",
    taskRef: FIXTURE_TASK_REF,
    integrity: "2b6113075c5f2b597a50462ceec384965280262b3fd0cc5d186a17763f9a3a71",
    state: "owed",
    referenceDigest: FIXTURE_DIGEST,
  };
}

// A journey reference for the synthetic journey correlationId, with a valid v2 digest.
function journeyV2() {
  const ref = { ...v2Fixture(), taskRef: agentEntryCaller().correlationId };
  return { ...ref, referenceDigest: owedReferenceV2Digest(ref) };
}

function periodN() {
  const caller = workExchangeCaller();
  const entry = agentEntryCaller();
  return runRecordToAcceptedOutput({
    periodId: "period-N",
    taskId: caller.periodNTaskId,
    contextId: caller.contextId,
    clock: CLOCK,
    termsInput: termsInputFromCaller(caller),
    ingestion: periodNCapture(),
    delivery: usefulDelivery,
    correlationId: entry.correlationId,
    token: entry.token,
    tool: entry.tool,
    measurement: entry.measurement,
    step: entry.step,
    acquisitionPath: "installed",
  });
}

function followUp(extra = {}) {
  const caller = workExchangeCaller();
  return {
    periodId: "period-N+1",
    taskId: caller.periodNPlus1TaskId,
    contextId: caller.contextId,
    termsInput: termsInputFromCaller(caller, { preview: periodNPlus1Preview() }),
    ingestion: periodNPlus1Same(),
    delivery: usefulDelivery,
    step: 1,
    ...extra,
  };
}

describe("owed-reference positive", () => {
  test("v2 digest of the pinned fixture body is 212a845a, insertion order, no prefix", () => {
    assert.equal(owedReferenceV2Digest(v2Fixture()), FIXTURE_DIGEST);
    assert.match(owedReferenceV2Digest(v2Fixture()), /^[0-9a-f]{64}$/);
  });

  test("the key-sorted canonicalJson digest differs, so it must not be used", () => {
    const { schema, obligationId, taskRef, integrity, state } = v2Fixture();
    const body = { schema, obligationId, taskRef, integrity, state };
    const sorted = createHash("sha256").update(canonicalJson(body)).digest("hex");
    assert.equal(sorted, SORTED_DIGEST);
    assert.notEqual(sorted, FIXTURE_DIGEST);
    assert.equal(jsonBodySha256(body), `sha256:${SORTED_DIGEST}`);
    assert.notEqual(jsonBodySha256(body), FIXTURE_DIGEST);
  });

  test("v1 with exactly six keys is accepted with referenceDigest null", () => {
    const result = consumeOwedReference(v1Fixture());
    assert.equal(result.ok, true);
    assert.equal(result.version, 1);
    assert.equal(result.reference.referenceDigest, null);
    assert.equal(result.exception, null);
  });

  test("v2 with a matching referenceDigest is accepted", () => {
    const result = consumeOwedReference(v2Fixture());
    assert.equal(result.ok, true);
    assert.equal(result.version, 2);
    assert.equal(result.reference.referenceDigest, FIXTURE_DIGEST);
  });

  test("bind returns obligationId, taskRef, integrity and referenceDigest when taskRef equals correlationId", () => {
    const bound = bindOwedReferenceToJourney(v2Fixture(), { correlationId: FIXTURE_TASK_REF });
    assert.equal(bound.ok, true);
    assert.deepEqual(bound.binding, {
      obligationId: "syn-oblig-walletless-0001",
      taskRef: FIXTURE_TASK_REF,
      integrity: "2b6113075c5f2b597a50462ceec384965280262b3fd0cc5d186a17763f9a3a71",
      referenceDigest: FIXTURE_DIGEST,
    });
    const boundV1 = bindOwedReferenceToJourney(v1Fixture(), { correlationId: FIXTURE_TASK_REF });
    assert.equal(boundV1.ok, true);
    assert.equal(boundV1.binding.referenceDigest, null);
  });

  test("replayLaterPeriod without owedReference is unchanged and has no owedBinding", () => {
    const replay = replayLaterPeriod({ periodN: periodN(), clock: CLOCK, followUp: followUp() });
    assert.equal(replay.outcome, "useful_no_change");
    assert.equal("owedBinding" in replay, false);
  });

  test("replayLaterPeriod binds owedReference via followUp.correlationId", () => {
    const ref = journeyV2();
    const replay = replayLaterPeriod({
      periodN: periodN(),
      clock: CLOCK,
      followUp: followUp({ owedReference: ref, correlationId: agentEntryCaller().correlationId }),
    });
    assert.equal(replay.outcome, "useful_no_change");
    assert.equal(replay.owedBinding.taskRef, agentEntryCaller().correlationId);
    assert.equal(replay.owedBinding.referenceDigest, ref.referenceDigest);
  });

  test("replayLaterPeriod falls back to periodN.caller.correlationId", () => {
    const first = periodN();
    assert.equal(first.caller.correlationId, "ae:corr:v1:n12UcRecurring00000001");
    const replay = replayLaterPeriod({ periodN: first, clock: CLOCK, followUp: followUp({ owedReference: journeyV2() }) });
    assert.equal(replay.outcome, "useful_no_change");
    assert.equal(replay.owedBinding.taskRef, first.caller.correlationId);
  });
});

describe("owed-reference failure", () => {
  test("v2 with a wrong referenceDigest is integrity_mismatch", () => {
    const result = consumeOwedReference({ ...v2Fixture(), state: "settled" });
    assert.equal(result.ok, false);
    assert.equal(result.code, "integrity_mismatch");
    assert.deepEqual(result.exception, { code: "integrity_mismatch", message: result.message });
    assert.equal(result.retry.retryable, false);
    assert.equal(result.actualDigest, FIXTURE_DIGEST);
  });

  test("v2 carrying the sorted digest is integrity_mismatch", () => {
    const result = consumeOwedReference({ ...v2Fixture(), referenceDigest: SORTED_DIGEST });
    assert.equal(result.code, "integrity_mismatch");
  });

  test("unknown schema is refused", () => {
    const result = consumeOwedReference({ ...v1Fixture(), schema: "pilot.agent-money.owed-reference.v3" });
    assert.equal(result.code, "owed_reference_schema_unknown");
    assert.equal(result.retry.retryable, false);
  });

  test("extra key is refused for v1 and v2", () => {
    const v1 = consumeOwedReference({ ...v1Fixture(), amount: "0" });
    assert.equal(v1.code, "owed_reference_keys_mismatch");
    assert.deepEqual(v1.extraKeys, ["amount"]);
    const v1WithDigest = consumeOwedReference({ ...v1Fixture(), referenceDigest: null });
    assert.equal(v1WithDigest.code, "owed_reference_keys_mismatch");
    const v2 = consumeOwedReference({ ...v2Fixture(), payout: "x" });
    assert.equal(v2.code, "owed_reference_keys_mismatch");
  });

  test("v2 missing referenceDigest is refused", () => {
    const { referenceDigest, ...rest } = v2Fixture();
    const result = consumeOwedReference(rest);
    assert.equal(result.code, "owed_reference_keys_mismatch");
    assert.deepEqual(result.missingKeys, ["referenceDigest"]);
  });

  test("non-synthetic, malformed and non-object references are refused", () => {
    assert.equal(consumeOwedReference({ ...v1Fixture(), synthetic: false }).code, "owed_reference_not_synthetic");
    assert.equal(consumeOwedReference({ ...v1Fixture(), taskRef: "Bearer abc" }).code, "owed_reference_field_invalid");
    assert.equal(consumeOwedReference({ ...v1Fixture(), integrity: "zz" }).code, "owed_reference_field_invalid");
    assert.equal(consumeOwedReference(null).code, "owed_reference_invalid");
    assert.equal(consumeOwedReference([]).code, "owed_reference_invalid");
  });

  test("bind refuses owed_reference_unbound when taskRef differs or correlationId is missing", () => {
    const wrong = bindOwedReferenceToJourney(v2Fixture(), { correlationId: "ae:corr:v1:n12UcRecurring00000001" });
    assert.equal(wrong.code, "owed_reference_unbound");
    assert.equal(wrong.retry.retryable, false);
    assert.equal(bindOwedReferenceToJourney(v2Fixture(), {}).code, "owed_reference_unbound");
  });

  test("replayLaterPeriod refuses an unbound owedReference before running the later period", () => {
    const replay = replayLaterPeriod({ periodN: periodN(), clock: CLOCK, followUp: followUp({ owedReference: v2Fixture() }) });
    assert.equal(replay.ok, false);
    assert.equal(replay.reason, "owed_reference_unbound");
    assert.equal(replay.exception.code, "owed_reference_unbound");
    assert.equal(replay.retry.retryable, false);
    assert.equal("periodNPlus1" in replay, false);
  });

  test("no owed-reference code is retryable or joins the continuity retryable set", () => {
    for (const code of OWED_REFERENCE_CODES) assert.equal(CONTINUITY_RETRYABLE.has(code), false);
  });
});

describe("owed-reference recovery", () => {
  test("integrity_mismatch then the corrected v2 reference is accepted", () => {
    const bad = consumeOwedReference({ ...v2Fixture(), referenceDigest: SORTED_DIGEST });
    assert.equal(bad.code, "integrity_mismatch");
    const good = consumeOwedReference({ ...v2Fixture(), referenceDigest: bad.expectedDigest });
    assert.equal(good.ok, true);
    assert.equal(good.reference.referenceDigest, FIXTURE_DIGEST);
  });

  test("owed_reference_unbound replay then the reference for this journey binds", () => {
    const first = periodN();
    const refused = replayLaterPeriod({ periodN: first, clock: CLOCK, followUp: followUp({ owedReference: v2Fixture() }) });
    assert.equal(refused.reason, "owed_reference_unbound");
    const replay = replayLaterPeriod({ periodN: first, clock: CLOCK, followUp: followUp({ owedReference: journeyV2() }) });
    assert.equal(replay.ok, true);
    assert.equal(replay.owedBinding.taskRef, first.caller.correlationId);
  });

  test("extra key refusal then the exact-key v1 reference is accepted", () => {
    assert.equal(consumeOwedReference({ ...v1Fixture(), extra: 1 }).code, "owed_reference_keys_mismatch");
    assert.equal(consumeOwedReference(v1Fixture()).ok, true);
  });
});
