import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ERROR_CODE,
  GRANT_BACKENDS,
  OUTCOME,
  OWNER_STATE_FILE,
  SCHEMA,
  TASK_FILE,
  TOKEN_FILE_NAME,
  USABILITY_FILE,
} from "./constants.mjs";
import { fail } from "./errors.mjs";
import {
  defaultTokenPath,
  ensureEmptyDir,
  readGrantAttempt,
  readOwnerToken,
  resolveGrantDir,
  updateGrantAttempt,
  writeGrantAttempt,
  writeJsonSecretFree,
  writeSecretFile,
} from "./fs-grant.mjs";
import { hashToken, publicId, tokenFingerprint } from "./hash.mjs";
import { collectSecrets, redactValue } from "./redact.mjs";
import { parseClaimTermsVersion } from "./terms-version.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_TASK_FIXTURE = join(here, "..", "fixtures", "i01-journey-task.json");

export function loadFixtureTask(path = DEFAULT_TASK_FIXTURE) {
  const resolved = path && path !== true ? path : DEFAULT_TASK_FIXTURE;
  if (!existsSync(resolved)) {
    fail(ERROR_CODE.INVALID_INPUT, `task file not found: ${resolved}`);
  }
  const fixture = JSON.parse(readFileSync(resolved, "utf8"));
  const terms = { ...(fixture.terms || {}) };
  if (!terms.summary && fixture.summary) terms.summary = fixture.summary;
  return {
    title: fixture.title,
    summary: fixture.summary,
    provenance: fixture.provenance || "fixture",
    reward: fixture.reward,
    budget: fixture.budget,
    terms,
    correctionPolicy: fixture.correctionPolicy || { maxRevisions: 1 },
  };
}

export async function prepareReservedTask({
  adapter,
  ownerToken,
  outDir,
  taskBody,
  secrets = [],
}) {
  const created = await adapter.createTask(taskBody || loadFixtureTask(), { ownerToken });
  const task = created.body?.task;
  if (!task?.id) fail(ERROR_CODE.HTTP_ERROR, "create task did not return task.id");
  const termsVersion = parseClaimTermsVersion(task.termsVersion);
  const reserved = await adapter.reserveFunding(task.id, { ownerToken });
  const fundingState = reserved.body?.task?.fundingState;
  if (fundingState !== "reserved") {
    fail(ERROR_CODE.HTTP_ERROR, "funding reserve did not reach fundingState=reserved");
  }
  const record = {
    schema: SCHEMA.ownerState,
    command: "prepare-reserved-task",
    outcome: OUTCOME.SUCCESS,
    taskId: task.id,
    termsVersion,
    fundingState,
    provenance: task.provenance,
    evidenceClass: adapter.evidenceClass,
    payoutNote: "nonsettling prototype; this step does not pay",
  };
  const taskPath = writeJsonSecretFree(join(outDir, TASK_FILE), record, secrets);
  return { ...record, taskPath };
}

export async function issueContributorSession({
  adapter,
  ownerToken,
  outDir,
  contributorPublicId,
  taskId,
  provenance = "fixture",
  autoRetryUnknownGrant = false,
  secrets: extraSecrets = [],
}) {
  if (autoRetryUnknownGrant) {
    fail(
      ERROR_CODE.UNKNOWN_GRANT_NO_AUTO_RETRY,
      "grant issuance is owner-only and has no idempotency key; never automatically retry an unknown grant",
    );
  }
  if (adapter.backend === GRANT_BACKENDS.LEDGER) {
    fail(
      ERROR_CODE.LEDGER_GRANT_NOT_EARNED_WORK_CLAIM,
      "earned-work claim tokens come from POST /v1/contributor-tokens, not F04 /v1/grants",
    );
  }

  const dir = ensureEmptyDir(outDir);
  const publicContributorId = contributorPublicId || publicId("fixture-contrib");
  writeGrantAttempt(dir, {
    command: "issue",
    backend: adapter.backend,
    contributorPublicId: publicContributorId,
    taskId: taskId || null,
    status: "pending",
  });

  const body = {
    contributorPublicId: publicContributorId,
    provenance,
  };
  if (taskId) body.taskId = taskId;

  let issued;
  try {
    issued = await adapter.issueContributorToken(body, { ownerToken });
  } catch (error) {
    updateGrantAttempt(dir, {
      status: error?.code === ERROR_CODE.UNKNOWN_OUTCOME ? "unknown" : "failed",
      httpStatus: error?.status ?? null,
      errorCode: error?.code || "http_error",
    });
    if (error?.code === ERROR_CODE.UNKNOWN_OUTCOME) {
      fail(
        ERROR_CODE.UNKNOWN_OUTCOME,
        error.message || "Grant outcome unknown. Do not automatically retry. Reconcile without posting another grant.",
        { status: error.status, outcome: OUTCOME.UNKNOWN, usedOwnerToken: false, grantPosted: true },
      );
    }
    throw error;
  }

  const token = issued.body?.token;
  if (typeof token !== "string" || !token) {
    updateGrantAttempt(dir, { status: "unknown", httpStatus: issued.status });
    fail(
      ERROR_CODE.UNKNOWN_OUTCOME,
      "HTTP 201 contributor-tokens without token plaintext is unknown, not a grant",
      { status: issued.status, outcome: OUTCOME.UNKNOWN },
    );
  }
  const tokenHash = hashToken(token);
  const fingerprint = tokenFingerprint(token);
  const secrets = collectSecrets(ownerToken, token, ...extraSecrets);
  const tokenFile = writeSecretFile(defaultTokenPath(dir), token);
  updateGrantAttempt(dir, {
    status: "issued",
    httpStatus: issued.status,
    tokenFingerprint: fingerprint,
  });

  const state = {
    schema: SCHEMA.ownerState,
    role: "owner",
    command: "issue",
    outcome: OUTCOME.SUCCESS,
    backend: adapter.backend,
    evidenceClass: adapter.evidenceClass,
    contributorPublicId: issued.body.contributorPublicId || publicContributorId,
    expiresAt: issued.body.expiresAt ?? null,
    provenance: issued.body.provenance || provenance,
    tokenFile,
    tokenHash,
    tokenFingerprint: fingerprint,
    taskId: taskId || null,
    plaintextReturnedOnce: true,
    plaintextInState: false,
  };
  const stateFile = writeJsonSecretFree(join(dir, OWNER_STATE_FILE), state, secrets);
  const usability = redactValue(
    {
      schema: SCHEMA.usability,
      steps: ["reserve_empty_out_dir", "write_grant_attempt", "POST /v1/contributor-tokens", "write_bearer_file", "write_owner_state_hash_only"],
      tokenFingerprint: fingerprint,
      tokenFile,
      secretFree: true,
    },
    secrets,
  );
  const usabilityFile = writeJsonSecretFree(join(dir, USABILITY_FILE), usability, secrets);

  return {
    ok: true,
    outcome: OUTCOME.SUCCESS,
    ...state,
    stateFile,
    usabilityFile,
  };
}

export function reconcileGrantFromDir({ outDir, env = process.env } = {}) {
  const dir = resolveGrantDir(outDir);
  const tokenPath = join(dir, TOKEN_FILE_NAME);
  if (existsSync(tokenPath)) {
    const token = readFileSync(tokenPath, "utf8").trim();
    if (!token) {
      fail(ERROR_CODE.UNKNOWN_OUTCOME, "token file is empty; grant remains unknown", {
        outcome: OUTCOME.UNKNOWN,
        usedOwnerToken: false,
        grantPosted: false,
      });
    }
    const secrets = collectSecrets(token, env.EARNED_WORK_OWNER_TOKEN);
    const tokenHash = hashToken(token);
    const fingerprint = tokenFingerprint(token);
    const attempt = existsSync(join(dir, "grant-attempt.json")) ? readGrantAttempt(dir) : null;
    const record = {
      ok: true,
      outcome: OUTCOME.SUCCESS,
      schema: SCHEMA.ownerState,
      command: "reconcile",
      role: "owner",
      tokenFile: tokenPath,
      tokenHash,
      tokenFingerprint: fingerprint,
      contributorPublicId: attempt?.contributorPublicId ?? null,
      taskId: attempt?.taskId ?? null,
      usedOwnerToken: false,
      grantPosted: false,
      plaintextInState: false,
    };
    writeJsonSecretFree(join(dir, OWNER_STATE_FILE), { ...record, schema: SCHEMA.ownerState }, secrets);
    return record;
  }

  const attempt = readGrantAttempt(dir);
  fail(
    ERROR_CODE.UNKNOWN_OUTCOME,
    "Non-idempotent grant has no token file. Outcome remains unknown. Do not POST /v1/contributor-tokens again and do not send Idempotency-Key.",
    {
      status: attempt.httpStatus ?? null,
      outcome: OUTCOME.UNKNOWN,
      usedOwnerToken: false,
      grantPosted: false,
    },
  );
}

export async function issueLedgerContributorGrant({
  adapter,
  adminToken,
  outDir,
  contributorPublicId,
  autoRetryUnknownGrant = false,
}) {
  if (autoRetryUnknownGrant) {
    fail(
      ERROR_CODE.UNKNOWN_GRANT_NO_AUTO_RETRY,
      "ledger grant issuance is owner-only and has no idempotency key; never automatically retry",
    );
  }
  const dir = ensureEmptyDir(outDir);
  const publicContributorId = contributorPublicId || publicId("ledger-contrib");
  writeGrantAttempt(dir, {
    command: "issue-ledger-grant",
    backend: GRANT_BACKENDS.LEDGER,
    contributorPublicId: publicContributorId,
    status: "pending",
  });
  let issued;
  try {
    issued = await adapter.issueContributorGrant(
      { contributorPublicId: publicContributorId },
      { adminToken },
    );
  } catch (error) {
    updateGrantAttempt(dir, {
      status: error?.code === ERROR_CODE.UNKNOWN_OUTCOME ? "unknown" : "failed",
      httpStatus: error?.status ?? null,
      errorCode: error?.code || "http_error",
    });
    if (error?.code === ERROR_CODE.UNKNOWN_OUTCOME) {
      fail(ERROR_CODE.UNKNOWN_OUTCOME, error.message, {
        status: error.status,
        outcome: OUTCOME.UNKNOWN,
        usedOwnerToken: false,
        grantPosted: true,
      });
    }
    throw error;
  }
  const token = issued.body?.token;
  if (typeof token !== "string") {
    updateGrantAttempt(dir, { status: "unknown", httpStatus: issued.status });
    fail(ERROR_CODE.UNKNOWN_OUTCOME, "ledger grant HTTP 201 without token is unknown", {
      status: issued.status,
      outcome: OUTCOME.UNKNOWN,
    });
  }
  const secrets = collectSecrets(adminToken, token);
  const tokenFile = writeSecretFile(defaultTokenPath(dir), token);
  updateGrantAttempt(dir, { status: "issued", httpStatus: issued.status });
  const state = {
    schema: SCHEMA.ownerState,
    role: "owner",
    command: "issue-ledger-grant",
    outcome: OUTCOME.SUCCESS,
    backend: GRANT_BACKENDS.LEDGER,
    evidenceClass: adapter.evidenceClass,
    contributorPublicId: issued.body.contributorPublicId || publicContributorId,
    grantId: issued.body.grantId || null,
    tokenFile,
    tokenHash: hashToken(token),
    tokenFingerprint: tokenFingerprint(token),
    laterBinding: "F04 ledger grant is not an earned-work claim credential",
    plaintextInState: false,
  };
  const stateFile = writeJsonSecretFree(join(dir, OWNER_STATE_FILE), state, secrets);
  return { ok: true, outcome: OUTCOME.SUCCESS, ...state, stateFile };
}

export { readOwnerToken };
