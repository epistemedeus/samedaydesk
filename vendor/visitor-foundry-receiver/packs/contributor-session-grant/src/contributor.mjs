import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONTRIBUTOR_STATE_FILE,
  ENV_DUMP_FILE,
  ERROR_CODE,
  OUTCOME,
  OWNER_TOKEN_ENV,
  SCHEMA,
  USABILITY_FILE,
} from "./constants.mjs";
import { fail } from "./errors.mjs";
import { ensureDir, readTokenFileOnce, writeJsonSecretFree } from "./fs-grant.mjs";
import { hashToken, idempotencyKey, tokenFingerprint } from "./hash.mjs";
import {
  assertSecretFree,
  collectSecrets,
  contributorEnvForbidden,
  envDump,
  redactValue,
} from "./redact.mjs";
import { parseClaimTermsVersion } from "./terms-version.mjs";

export function readContributorState(stateDir) {
  const path = join(stateDir, CONTRIBUTOR_STATE_FILE);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

export function startContributorSession({
  tokenFile,
  stateDir,
  env = process.env,
  extraSecrets = [],
  persistState = true,
}) {
  contributorEnvForbidden(env);
  const dir = ensureDir(stateDir);
  if (readContributorState(dir)?.claimIdempotencyKey) {
    fail(ERROR_CODE.TARGET_CHANGED, "state directory already contains a claim attempt; reconcile it or use a fresh directory for different work");
  }
  const token = readTokenFileOnce(tokenFile);
  const tokenHash = hashToken(token);
  const fingerprint = tokenFingerprint(token);
  const secrets = collectSecrets(token, env[OWNER_TOKEN_ENV], ...extraSecrets);

  const dump = {
    schema: SCHEMA.envDump,
    ...envDump(env, secrets),
  };
  assertSecretFree(dump, secrets, ENV_DUMP_FILE);
  const envDumpFile = writeJsonSecretFree(join(dir, ENV_DUMP_FILE), dump, secrets);

  const state = {
    schema: SCHEMA.contributorState,
    role: "contributor",
    command: "start",
    outcome: OUTCOME.SUCCESS,
    tokenFile,
    tokenHash,
    tokenFingerprint: fingerprint,
    ownerTokenEnvPresent: dump.ownerTokenEnvPresent,
    plaintextInState: false,
    rawBearerInState: false,
  };
  const stateFile = persistState ? writeJsonSecretFree(join(dir, CONTRIBUTOR_STATE_FILE), state, secrets) : null;
  return { token, tokenHash, fingerprint, secrets, dir, stateFile, envDumpFile, state };
}

function persistClaimState({ dir, secrets, payload, exclusive = false }) {
  const path = join(dir, CONTRIBUTOR_STATE_FILE);
  try {
    return writeJsonSecretFree(path, payload, secrets, 0o600, exclusive ? "wx" : "w");
  } catch (error) {
    if (exclusive && error.code === "EEXIST") {
      fail(ERROR_CODE.TARGET_CHANGED, "state directory already exists; a fresh claim cannot overwrite an earlier attempt");
    }
    throw error;
  }
}

export async function claimWithSessionFile({
  adapter,
  tokenFile,
  stateDir,
  taskId,
  termsVersion,
  env = process.env,
  extraSecrets = [],
  claimKey,
}) {
  if (!taskId) fail(ERROR_CODE.INVALID_INPUT, "--task-id is required for contributor claim");
  const parsedTerms = parseClaimTermsVersion(termsVersion);
  const requestTarget = adapter.claimTarget?.(taskId) ?? null;
  const started = startContributorSession({ tokenFile, stateDir, env, extraSecrets, persistState: false });
  const { token, secrets, dir, fingerprint, tokenHash } = started;
  const key = claimKey || idempotencyKey("claim");

  persistClaimState({
    dir,
    secrets,
    exclusive: true,
    payload: {
      schema: SCHEMA.contributorState,
      role: "contributor",
      command: "claim",
      outcome: "pending",
      taskId,
      requestTarget,
      termsVersion: parsedTerms,
      claimIdempotencyKey: key,
      tokenHash,
      tokenFingerprint: fingerprint,
      tokenFile,
      reservationId: null,
      plaintextInState: false,
      rawBearerInState: false,
      ownerTokenEnvPresent: false,
    },
  });

  let claimed;
  try {
    claimed = await adapter.claim(
      taskId,
      { termsVersion: parsedTerms },
      { contributorToken: token, idempotencyKey: key },
    );
  } catch (error) {
    persistClaimState({
      dir,
      secrets,
      payload: unknownClaimState({
        fingerprint,
        tokenHash,
        tokenFile,
        taskId,
        parsedTerms,
        claimKey: key,
        requestTarget,
        status: error?.status,
      }),
    });
    if (error?.code === ERROR_CODE.UNKNOWN_OUTCOME) {
      fail(ERROR_CODE.UNKNOWN_OUTCOME, error.message, {
        status: error.status,
        outcome: OUTCOME.UNKNOWN,
        usedOwnerToken: false,
      });
    }
    throw error;
  }

  return finishClaim({
    claimed,
    dir,
    secrets,
    fingerprint,
    tokenHash,
    tokenFile,
    taskId,
    parsedTerms,
    key,
    requestTarget,
    adapter,
    envDumpFile: started.envDumpFile,
    command: "claim",
  });
}

export async function reconcileClaimWithSessionFile({
  adapter,
  tokenFile,
  stateDir,
  taskId,
  termsVersion,
  env = process.env,
  extraSecrets = [],
  claimKey,
}) {
  contributorEnvForbidden(env);
  const dir = ensureDir(stateDir);
  const previous = readContributorState(dir);
  if (!previous || !previous.claimIdempotencyKey || !previous.taskId || !previous.termsVersion) {
    fail(
      ERROR_CODE.MISSING_CLAIM_ATTEMPT,
      "reconcile requires an existing pending or unknown claim attempt; it cannot start a new claim",
    );
  }
  const token = readTokenFileOnce(tokenFile);
  const tokenHash = hashToken(token);
  const fingerprint = tokenFingerprint(token);
  if (previous.tokenFingerprint && previous.tokenFingerprint !== fingerprint) {
    fail(
      ERROR_CODE.FOREIGN_CREDENTIAL,
      "same-label foreign credential cannot replay this claim; zero HTTP",
      { storedFingerprint: previous.tokenFingerprint },
    );
  }
  if (!previous.tokenFingerprint && previous.tokenHash && previous.tokenHash !== tokenHash) {
    fail(
      ERROR_CODE.FOREIGN_CREDENTIAL,
      "same-label foreign credential cannot replay this claim; zero HTTP",
      { storedHash: previous.tokenHash },
    );
  }
  if (taskId && taskId !== previous.taskId) {
    fail(ERROR_CODE.TARGET_CHANGED, "reconcile cannot change taskId of the stored attempt", {
      stored: previous.taskId,
      presented: taskId,
    });
  }
  if (termsVersion && parseClaimTermsVersion(termsVersion) !== previous.termsVersion) {
    fail(ERROR_CODE.TARGET_CHANGED, "reconcile cannot change termsVersion of the stored attempt", {
      stored: previous.termsVersion,
    });
  }
  if (claimKey && claimKey !== previous.claimIdempotencyKey) {
    fail(ERROR_CODE.TARGET_CHANGED, "reconcile cannot replace the stored Idempotency-Key", {
      stored: previous.claimIdempotencyKey,
    });
  }
  const requestTarget = adapter.claimTarget?.(previous.taskId) ?? null;
  if (!previous.requestTarget || !requestTarget ||
      previous.requestTarget.origin !== requestTarget.origin ||
      previous.requestTarget.method !== requestTarget.method ||
      previous.requestTarget.path !== requestTarget.path) {
    fail(ERROR_CODE.TARGET_CHANGED, "reconcile requires the original bound origin, method and path; legacy unbound attempts remain unknown, zero HTTP");
  }
  const secrets = collectSecrets(token, env[OWNER_TOKEN_ENV], ...extraSecrets);
  const dump = {
    schema: SCHEMA.envDump,
    ...envDump(env, secrets),
  };
  assertSecretFree(dump, secrets, ENV_DUMP_FILE);
  const envDumpFile = writeJsonSecretFree(join(dir, ENV_DUMP_FILE), dump, secrets);

  const key = previous.claimIdempotencyKey;
  const parsedTaskId = previous.taskId;
  const parsedTerms = previous.termsVersion;

  let claimed;
  try {
    claimed = await adapter.claim(
      parsedTaskId,
      { termsVersion: parsedTerms },
      { contributorToken: token, idempotencyKey: key },
    );
  } catch (error) {
    persistClaimState({
      dir,
      secrets,
      payload: unknownClaimState({
        fingerprint,
        tokenHash,
        tokenFile,
        taskId: parsedTaskId,
        parsedTerms,
        claimKey: key,
        requestTarget,
        status: error?.status,
      }),
    });
    if (error?.code === ERROR_CODE.UNKNOWN_OUTCOME) {
      fail(ERROR_CODE.UNKNOWN_OUTCOME, error.message, {
        status: error.status,
        outcome: OUTCOME.UNKNOWN,
        usedOwnerToken: false,
      });
    }
    throw error;
  }

  return finishClaim({
    claimed,
    dir,
    secrets,
    fingerprint,
    tokenHash,
    tokenFile,
    taskId: parsedTaskId,
    parsedTerms,
    key,
    requestTarget,
    adapter,
    envDumpFile,
    command: "reconcile",
  });
}

function unknownClaimState({ fingerprint, tokenHash, tokenFile, taskId, parsedTerms, claimKey, requestTarget, status }) {
  return {
    schema: SCHEMA.contributorState,
    role: "contributor",
    command: "claim",
    outcome: OUTCOME.UNKNOWN,
    taskId,
    requestTarget,
    termsVersion: parsedTerms,
    claimIdempotencyKey: claimKey,
    tokenHash,
    tokenFingerprint: fingerprint,
    tokenFile,
    reservationId: null,
    reservationStatus: null,
    httpStatus: status ?? null,
    plaintextInState: false,
    rawBearerInState: false,
    ownerTokenEnvPresent: false,
  };
}

function finishClaim({
  claimed,
  dir,
  secrets,
  fingerprint,
  tokenHash,
  tokenFile,
  taskId,
  parsedTerms,
  key,
  requestTarget,
  adapter,
  envDumpFile,
  command,
}) {
  const reservation = claimed.body?.reservation;
  if (!reservation?.id || !reservation.status) {
    persistClaimState({
      dir,
      secrets,
      payload: unknownClaimState({
        fingerprint,
        tokenHash,
        tokenFile,
        taskId,
        parsedTerms,
        claimKey: key,
        requestTarget,
        status: claimed.status,
      }),
    });
    fail(
      ERROR_CODE.UNKNOWN_OUTCOME,
      "HTTP 201 with an empty body is unknown, not a claim",
      { status: claimed.status, outcome: OUTCOME.UNKNOWN, usedOwnerToken: false },
    );
  }

  const nextState = {
    schema: SCHEMA.contributorState,
    role: "contributor",
    command,
    outcome: OUTCOME.SUCCESS,
    taskId,
    requestTarget,
    termsVersion: parsedTerms,
    claimIdempotencyKey: key,
    tokenHash,
    tokenFingerprint: fingerprint,
    tokenFile,
    reservationId: reservation.id,
    reservationStatus: reservation.status,
    lifecycle: claimed.body?.task?.lifecycle || null,
    evidenceClass: adapter.evidenceClass,
    replayed: claimed.status === 200,
    usedOwnerToken: false,
    plaintextInState: false,
    rawBearerInState: false,
    ownerTokenEnvPresent: false,
  };
  const stateFile = persistClaimState({ dir, secrets, payload: nextState });
  const usability = redactValue(
    {
      schema: SCHEMA.usability,
      steps: ["reject_owner_token_env", "read_token_file_once", "hash_at_rest", "POST /v1/tasks/{id}/claims", "write_state_without_plaintext"],
      tokenFingerprint: fingerprint,
      reservationId: nextState.reservationId,
      secretFree: true,
    },
    secrets,
  );
  const usabilityFile = writeJsonSecretFree(join(dir, USABILITY_FILE), usability, secrets);
  return {
    ok: true,
    outcome: OUTCOME.SUCCESS,
    ...nextState,
    stateFile,
    envDumpFile,
    usabilityFile,
    httpStatus: claimed.status,
    usedOwnerToken: false,
  };
}
