import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { projectAgentEntryPublicCaller, projectTaskIdentity, refuseAuthorizingCallerField } from "./caller-projection.mjs";
import { projectN8nEquivalentEnvelope } from "./ingestion-projection.mjs";
import {
  COMPARISON_COLUMNS,
  COMPARISON_ROWS,
  COMPARISON_SOURCE,
  PARENT_REFS,
  recoverLostReply,
  replayLaterPeriod,
  runRecordToAcceptedOutput,
} from "./journey.mjs";
import {
  agentEntryCaller,
  CLOCK,
  hostedEquivalentSame,
  periodNCapture,
  periodNPlus1Changed,
  periodNPlus1Same,
  periodNPlus1Preview,
  periodNPlus1SchemaChange,
  periodNPreview,
  periodNReadAccepted,
  termsInputFromCaller,
  uncommittedDelivery,
  usefulDelivery,
  workExchangeCaller,
} from "./fixtures/load-synthetic-recurring.mjs";
import { assertTermsUnchanged, projectWorkExchangeCallerTerms } from "./terms-projection.mjs";

const fixtureDir = dirname(fileURLToPath(import.meta.url));

function loadFailure(name) {
  return JSON.parse(readFileSync(join(fixtureDir, "fixtures", name), "utf8"));
}

function periodNInput(overrides = {}) {
  const caller = workExchangeCaller();
  const entry = agentEntryCaller();
  return {
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
    ...overrides,
  };
}

describe("positive", () => {
  test("period N turns a permitted ingestion record into an accepted output bound to the exchange-supplied termsVersion", () => {
    const terms = projectWorkExchangeCallerTerms(termsInputFromCaller(workExchangeCaller()));
    const result = runRecordToAcceptedOutput(periodNInput());
    assert.equal(result.ok, true);
    assert.equal(result.outcome, "accepted_output");
    assert.equal(result.artifact.decision, "accept");
    assert.equal(result.termsVersion, periodNPreview().termsVersion);
    assert.equal(result.termsVersion, terms.termsVersion);
    assert.notEqual(terms.localTermsVersion, terms.termsVersion);
    assert.match(result.termsVersion, /^sha256:[0-9a-f]{64}$/);
    assert.equal(result.identity.taskId, "tsk_synthetic_period_n");
    assert.equal(result.identity.contextId, "wx-synthetic-recurring-context");
    assert.equal(result.identity.followsTaskId, null);
    assert.equal(result.caller.correlationId, "ae:corr:v1:n12UcRecurring00000001");
    assert.equal(result.caller.tokenHeld, false);
    assert.equal("token" in result.caller, false);
    assert.equal("discovery" in result.caller, false);
    assert.equal(result.measurement.discovery.status, "declared");
    assert.equal(result.measurement.discovery.source, "cli");
    assert.deepEqual(result.acceptedOutput.result.output, ["order_id", "ship_date"]);
    assert.equal(result.period.idempotencyKey, result.contract.requestDigest);
    assert.equal(result.period.idempotencyKey, result.artifact.requestDigest);
    assert.equal(result.period.recordEvidence.termsVersion, result.termsVersion);
    assert.equal(result.period.recordEvidence.captureId, "cap-synthetic-period-n");
    assert.equal(result.period.completeness.complete, true);
    assert.equal(result.period.exception, null);
    assert.equal(result.period.retry.secondEffect, false);
    assert.equal(PARENT_REFS.adjudicationPin.sha, "0d9eed5f7b949f71767724cbf3d72ac55ad3dbb2");
    assert.equal(PARENT_REFS.workExchangePr463.sha, "ab7a3a0552e07ef5055ce48b442d7c0ee96bbaad");
    assert.equal(PARENT_REFS.workExchangeReceipt.sha, "98f561e1ab3f75478da08f711b37af8fc9f04562");
  });

  test("later-period replay of the same fields is useful_no_change on a new follow-up task in the same context", () => {
    const first = runRecordToAcceptedOutput(periodNInput());
    const caller = workExchangeCaller();
    const replay = replayLaterPeriod({
      periodN: first,
      clock: CLOCK,
      followUp: {
        periodId: "period-N+1",
        taskId: caller.periodNPlus1TaskId,
        contextId: caller.contextId,
        termsInput: termsInputFromCaller(caller, { preview: periodNPlus1Preview() }),
        ingestion: periodNPlus1Same(),
        delivery: usefulDelivery,
        step: 1,
      },
    });
    assert.equal(replay.useful, true);
    assert.equal(replay.outcome, "useful_no_change");
    assert.equal(replay.periodNPlus1.identity.taskId, "tsk_synthetic_period_n_plus_1");
    assert.equal(replay.periodNPlus1.identity.followsTaskId, "tsk_synthetic_period_n");
    assert.equal(replay.periodNPlus1.identity.contextId, first.identity.contextId);
    assert.notEqual(replay.periodNPlus1.termsVersion, first.termsVersion);
    assert.equal(replay.periodNPlus1.ok, true);
    assert.ok(replay.periodNPlus1.period.idempotencyKey);
    assert.notEqual(replay.periodNPlus1.period.idempotencyKey, first.period.idempotencyKey);
  });

  test("the exchange-supplied termsVersion from preview or readAccepted authorizes", () => {
    const fromPreview = runRecordToAcceptedOutput(periodNInput({
      termsInput: termsInputFromCaller(workExchangeCaller(), { preview: periodNPreview() }),
    }));
    assert.equal(fromPreview.ok, true);
    assert.equal(fromPreview.termsVersion, periodNPreview().termsVersion);
    const fromAccepted = runRecordToAcceptedOutput(periodNInput({
      termsInput: termsInputFromCaller(workExchangeCaller(), {
        preview: null,
        readAccepted: periodNReadAccepted(),
      }),
    }));
    assert.equal(fromAccepted.ok, true);
    assert.equal(fromAccepted.termsVersion, periodNReadAccepted().termsVersion);
  });

  test("the stable comparison table cites Workflow Kits for Make and n8n and lists every native period code", () => {
    assert.deepEqual([...COMPARISON_COLUMNS], ["steps", "failureHandling", "recovery", "duplicateEffects"]);
    assert.equal(typeof COMPARISON_ROWS.native.steps, "string");
    assert.match(COMPARISON_ROWS.native.recovery, /request digest/);
    assert.match(COMPARISON_ROWS.native.duplicateEffects, /secondEffect is false/);
    for (const code of [
      "ingestion_missing",
      "ingestion_incomplete",
      "ingestion_not_permitted",
      "capture_stale",
      "schema_changed",
      "terms_changed",
      "token_used_as_task_ref",
      "follow_up_not_new_task",
      "continuation_file_missing",
    ]) {
      assert.match(COMPARISON_ROWS.native.failureHandling, new RegExp(`\\b${code}\\b`));
    }
    for (const kit of ["make", "n8n"]) {
      assert.deepEqual(Object.keys(COMPARISON_ROWS[kit]), [...COMPARISON_COLUMNS]);
      assert.match(COMPARISON_ROWS[kit].steps, /^7 /);
      assert.match(COMPARISON_ROWS[kit].recovery, /^3 /);
      assert.match(COMPARISON_ROWS[kit].duplicateEffects, /^0:/);
      assert.match(COMPARISON_ROWS[kit].duplicateEffects, /not a live run/);
    }
    assert.match(COMPARISON_ROWS.make.steps, /11 in the scenario/);
    assert.match(COMPARISON_ROWS.make.failureHandling, /^3 router routes/);
    assert.match(COMPARISON_ROWS.n8n.steps, /15 in the workflow/);
    assert.match(COMPARISON_ROWS.n8n.failureHandling, /^2 If nodes and 3 response outcomes/);
    assert.equal(COMPARISON_SOURCE.sha, "806ebd9efe60b41943814bfb87bb293ea0d7fc9d");
    assert.equal(COMPARISON_SOURCE.firstComputedAt, "dc1179a7cf30446d0650d0ca94a5e210ad9f4389");
    assert.equal(COMPARISON_SOURCE.vendorPins.recurringJourney, "175245e38f86431dcdfcf6607580e3af0b999d68");
    assert.match(COMPARISON_SOURCE.vmRun.summary, /not commercial acceptance/);
    assert.equal(COMPARISON_SOURCE.path, "integrations/workflow-kits-n12/COMPARISON.json");
    assert.match(COMPARISON_SOURCE.method, /not a live Make or n8n run/);
    assert.match(COMPARISON_SOURCE.caveat, /client endpoint, not from Make or n8n/);
    assert.equal(COMPARISON_SOURCE.hostedImports.n8n.status, "cloud_qa_import_received");
    assert.equal(COMPARISON_SOURCE.hostedImports.make.status, "not_imported");
  });
});

describe("failure and exception", () => {
  test("missing ingestion is unavailable and does not fabricate an accepted output", () => {
    const result = runRecordToAcceptedOutput(periodNInput({ ingestion: null }));
    assert.equal(result.ok, false);
    assert.equal(result.outcome, "unavailable");
    assert.equal(result.reason, "ingestion_missing");
    assert.equal(result.acceptedOutput, null);
    assert.equal(result.period.exception.code, "ingestion_missing");
    assert.equal(result.period.retry.retryable, true);
  });

  test("a stale permitted-failure capture is rejected as stale", () => {
    const result = runRecordToAcceptedOutput(periodNInput({
      ingestion: loadFailure("synthetic-permitted-failure-stale.json"),
    }));
    assert.equal(result.ok, false);
    assert.equal(result.outcome, "stale");
    assert.equal(result.reason, "capture_stale");
    assert.equal(result.period.exception.code, "capture_stale");
  });

  test("an unpermitted capture is unavailable", () => {
    const result = runRecordToAcceptedOutput(periodNInput({
      ingestion: loadFailure("synthetic-permitted-failure-unpermitted.json"),
    }));
    assert.equal(result.ok, false);
    assert.equal(result.reason, "ingestion_not_permitted");
    assert.equal(result.acceptedOutput, null);
  });

  test("a bearer token cannot authorize acceptance when used as taskRef", () => {
    const fixture = loadFailure("synthetic-permitted-failure-token-as-taskref.json");
    const refused = refuseAuthorizingCallerField({ taskRef: fixture.taskRef });
    assert.equal(refused.ok, false);
    assert.equal(refused.reason, "token_used_as_task_ref");
    const result = runRecordToAcceptedOutput(periodNInput({
      correlationId: fixture.taskRef,
    }));
    assert.equal(result.ok, false);
    assert.equal(result.reason, "token_used_as_task_ref");
    assert.equal(result.acceptedOutput, null);
  });

  test("the same task with a changed exchange termsVersion is terms_changed", () => {
    const first = runRecordToAcceptedOutput(periodNInput());
    const check = assertTermsUnchanged(
      first.acceptedOutput.termsVersion,
      periodNPlus1Preview().termsVersion,
    );
    assert.equal(check.ok, false);
    assert.equal(check.reason, "terms_changed");
    assert.notEqual(periodNPlus1Preview().termsVersion, first.acceptedOutput.termsVersion);
  });

  test("a locally hashed termsVersion that differs from the exchange does not authorize", () => {
    const caller = workExchangeCaller();
    const local = projectWorkExchangeCallerTerms(termsInputFromCaller(caller, { preview: periodNPreview() }));
    assert.notEqual(local.localTermsVersion, periodNPreview().termsVersion);
    const result = runRecordToAcceptedOutput(periodNInput({
      termsInput: termsInputFromCaller(caller, {
        preview: periodNPreview(),
        claimedTermsVersion: local.localTermsVersion,
      }),
    }));
    assert.equal(result.ok, false);
    assert.equal(result.reason, "terms_changed");
    assert.equal(result.acceptedOutput, null);
    assert.equal(result.artifact, null);
    assert.notEqual(local.localTermsVersion, periodNPreview().termsVersion);
  });


  test("a missing continuation file is continuation_file_missing, not an empty success", () => {
    const result = runRecordToAcceptedOutput(periodNInput({
      continuationFileMissing: true,
    }));
    assert.equal(result.ok, false);
    assert.equal(result.outcome, "exception");
    assert.equal(result.reason, "continuation_file_missing");
    assert.equal(result.acceptedOutput, null);
    assert.equal(result.period.exception.code, "continuation_file_missing");
    assert.equal(result.period.retry.retryable, false);
  });

  test("discovery inside publicView is not taken as authority", () => {
    const entry = agentEntryCaller();
    const projected = projectAgentEntryPublicCaller({
      correlationId: entry.correlationId,
      step: 0,
      token: "<REDACTED>",
      tool: entry.tool,
      discovery: { status: "observed", source: "cli" },
      publicView: { discovery: { status: "observed", source: "cli" } },
    });
    assert.equal(projected.ok, true);
    assert.equal(Object.hasOwn(projected.publicView, "discovery"), false);
    assert.equal(projected.measurement.discovery.status, "unknown");
    assert.equal(projected.measurement.discovery.source, null);
    assert.equal(projected.authorizing, false);
    const result = runRecordToAcceptedOutput(periodNInput({
      measurement: null,
      discovery: { status: "observed", source: "cli" },
    }));
    assert.equal(result.ok, true);
    assert.equal(Object.hasOwn(result.caller, "discovery"), false);
    assert.equal(result.measurement.discovery.status, "unknown");
    assert.equal(result.measurement.discovery.source, null);
  });

  test("an integer termsVersion is refused", () => {
    const integer = projectTaskIdentity({
      taskId: "tsk_synthetic_period_n",
      contextId: "wx-synthetic-recurring-context",
      termsVersion: "1",
    });
    assert.equal(integer.ok, false);
    assert.equal(integer.reason, "terms_version_invalid");
  });

  test("a permitted Agent Entry subject-mismatch counterexample stays a refusal, not a credit", () => {
    const fixture = loadFailure("synthetic-permitted-failure-subject-mismatch.json");
    assert.equal(fixture.ok, false);
    assert.equal(fixture.charged, false);
    assert.equal(fixture.paymentRequired, false);
    assert.equal(fixture.code, "continuation_subject_mismatch");
    assert.equal("credit" in fixture, false);
  });
});

describe("recovery", () => {
  test("a lost reply after the first committed effect returns the original result with no second effect", () => {
    const first = runRecordToAcceptedOutput(periodNInput());
    const recovered = recoverLostReply(first, usefulDelivery(first.contract));
    assert.equal(recovered.ok, true);
    assert.equal(recovered.outcome, "recovered_original");
    assert.equal(recovered.artifact.recovered, true);
    assert.equal(recovered.artifact.secondEffect, false);
    assert.deepEqual(recovered.artifact.result, first.acceptedOutput.result);
    assert.equal(recovered.artifact.requestDigest, first.period.idempotencyKey);
  });

  test("an uncommitted first request does not fabricate an accepted output", () => {
    const result = runRecordToAcceptedOutput(periodNInput({
      delivery: uncommittedDelivery,
    }));
    assert.equal(result.ok, false);
    assert.equal(result.acceptedOutput, null);
    assert.equal(result.artifact.committed, false);
    assert.equal(result.period.exception.code, "uncommitted");
    assert.equal(result.period.retry.retryable, true);
    assert.match(result.message, /uncommitted/);
  });
});

describe("later-period replay", () => {
  test("a changed later-period record is useful_change and is not auto-accepted as the period N output", () => {
    const first = runRecordToAcceptedOutput(periodNInput());
    const caller = workExchangeCaller();
    const replay = replayLaterPeriod({
      periodN: first,
      clock: CLOCK,
      followUp: {
        periodId: "period-N+1",
        taskId: caller.periodNPlus1TaskId,
        contextId: caller.contextId,
        termsInput: termsInputFromCaller(caller, { preview: periodNPlus1Preview() }),
        ingestion: periodNPlus1Changed(),
        delivery: usefulDelivery,
        expectedResult: periodNPlus1Changed().payload,
        step: 1,
      },
    });
    assert.equal(replay.useful, true);
    assert.equal(replay.outcome, "useful_change");
    assert.deepEqual(replay.comparison.changedFields, ["output"]);
    assert.notDeepEqual(replay.periodNPlus1.acceptedOutput.result, first.acceptedOutput.result);
    assert.equal(replay.periodNPlus1.identity.taskId, caller.periodNPlus1TaskId);
  });

  test("the single later-period schema-change fixture is reported as schema_changed, not migrated", () => {
    const first = runRecordToAcceptedOutput(periodNInput());
    const caller = workExchangeCaller();
    const replay = replayLaterPeriod({
      periodN: first,
      clock: CLOCK,
      followUp: {
        periodId: "period-N+1",
        taskId: caller.periodNPlus1TaskId,
        contextId: caller.contextId,
        termsInput: termsInputFromCaller(caller, { preview: periodNPlus1Preview() }),
        ingestion: periodNPlus1SchemaChange(),
        delivery: usefulDelivery,
        step: 1,
      },
    });
    assert.equal(replay.ok, false);
    assert.equal(replay.reason, "schema_changed");
    assert.equal(replay.period.exception.code, "schema_changed");
    assert.deepEqual(replay.period.completeness.missingFields, ["output"]);
    assert.equal(replay.period.completeness.complete, false);
    assert.equal(replay.periodNPlus1.acceptedOutput, null);
  });

  test("mutating the period N task id instead of posting a follow-up is refused", () => {
    const first = runRecordToAcceptedOutput(periodNInput());
    const caller = workExchangeCaller();
    const replay = replayLaterPeriod({
      periodN: first,
      clock: CLOCK,
      followUp: {
        periodId: "period-N+1",
        taskId: caller.periodNTaskId,
        contextId: caller.contextId,
        termsInput: termsInputFromCaller(caller, { preview: periodNPlus1Preview() }),
        ingestion: periodNPlus1Same(),
        delivery: usefulDelivery,
      },
    });
    assert.equal(replay.ok, false);
    assert.equal(replay.reason, "follow_up_not_new_task");
  });
});

describe("native versus hosted-equivalent shape", () => {
  test("a synthetic stored-execution envelope can project the same payload as the installed capture", () => {
    const extracted = projectN8nEquivalentEnvelope(hostedEquivalentSame());
    assert.equal(extracted.ok, true);
    assert.deepEqual(extracted.payload, periodNCapture().payload);
    assert.equal(extracted.startTime, "2026-11-12T09:00:00.000Z");
  });

  test("a malformed hosted envelope never counts as agreement, and kit results are cited, not invented", () => {
    const extracted = projectN8nEquivalentEnvelope({ synthetic: true, execution: { status: "success" } });
    assert.equal(extracted.ok, false);
    assert.equal(extracted.reason, "equivalent_malformed");
    assert.equal(COMPARISON_SOURCE.owner, "Workflow Kits Nov12");
    assert.equal(COMPARISON_SOURCE.repo, "epistemedeus/samedaydesk");
  });
});
