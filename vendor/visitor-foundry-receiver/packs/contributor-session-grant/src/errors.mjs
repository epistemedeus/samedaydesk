import { ERROR_CODE, OUTCOME, SCHEMA } from "./constants.mjs";

const UNKNOWN_CODES = new Set([ERROR_CODE.UNKNOWN_OUTCOME]);

export function outcomeOf(error) {
  if (error?.outcome === OUTCOME.UNKNOWN || error?.outcome === OUTCOME.REFUSED) {
    return error.outcome;
  }
  if (UNKNOWN_CODES.has(error?.code)) return OUTCOME.UNKNOWN;
  return OUTCOME.REFUSED;
}

export class GrantError extends Error {
  constructor(code, message, extras = {}) {
    super(message);
    this.name = "GrantError";
    this.code = code;
    this.status = extras.status ?? null;
    this.evidenceClass = extras.evidenceClass ?? null;
    this.outcome = extras.outcome ?? (UNKNOWN_CODES.has(code) ? OUTCOME.UNKNOWN : OUTCOME.REFUSED);
    this.usedOwnerToken = extras.usedOwnerToken ?? null;
    this.grantPosted = extras.grantPosted ?? null;
  }
}

export function fail(code, message, extras = {}) {
  throw new GrantError(code, message, extras);
}

export function errorRecord(error) {
  const code = error?.code || "http_error";
  const record = {
    ok: false,
    outcome: outcomeOf(error),
    schema: SCHEMA.error,
    error: {
      code,
      message: error?.message || String(error),
    },
  };
  if (error?.status != null) record.httpStatus = error.status;
  if (error?.usedOwnerToken != null) record.usedOwnerToken = error.usedOwnerToken;
  if (error?.grantPosted != null) record.grantPosted = error.grantPosted;
  return record;
}

export function printError(error, write = process.stdout.write.bind(process.stdout)) {
  write(`${JSON.stringify(errorRecord(error), null, 2)}\n`);
}
