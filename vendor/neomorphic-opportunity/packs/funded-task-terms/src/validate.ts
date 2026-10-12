import { z } from "zod";
import { ERROR_CODES } from "./constants.js";
import { findExecutablePayload } from "./forbidden.js";
import { hashTermsVersion } from "./hash.js";
import { findNumberMoney, isPlainObject } from "./money.js";
import { fundedTaskTermsSchema } from "./schema.js";
import type { FundedTaskTerms, ParseFailure, ParseResult, TermsVersion } from "./types.js";

export class TermsValidationError extends Error {
  readonly code: string;
  readonly path: Array<string | number>;

  constructor(message: string, code: string, path: Array<string | number> = []) {
    super(message);
    this.name = "TermsValidationError";
    this.code = code;
    this.path = path;
  }
}

function issueCode(issue: z.ZodIssue, input: unknown): string {
  const root = issue.path[0];
  const second = issue.path[1];
  if (root === "reward" && (second === "amount" || second === "amountAtomic")) {
    return ERROR_CODES.FLOAT_REWARD;
  }
  if (root === "verifierVersion") {
    return ERROR_CODES.MISSING_VERIFIER_VERSION;
  }
  if (root === "correctionPolicy") {
    return ERROR_CODES.UNBOUNDED_CORRECTIONS;
  }
  if (root === "reservationDuration") {
    return ERROR_CODES.MISSING_RESERVATION_DURATION;
  }
  if (root === "failureAppealRoute") {
    return ERROR_CODES.MISSING_APPEAL_ROUTE;
  }
  if (root === "reward" && second === "amountAtomic") {
    return ERROR_CODES.ATOMIC_MISMATCH;
  }
  if (isPlainObject(input) && root === "correctionPolicy" && !("maxCorrections" in (input.correctionPolicy as object))) {
    return ERROR_CODES.UNBOUNDED_CORRECTIONS;
  }
  return ERROR_CODES.INVALID_INPUT;
}

function missingFieldCode(input: unknown): string | null {
  if (!isPlainObject(input)) return ERROR_CODES.INVALID_INPUT;
  if (!("verifierVersion" in input) || input.verifierVersion == null || input.verifierVersion === "") {
    return ERROR_CODES.MISSING_VERIFIER_VERSION;
  }
  if (!("reservationDuration" in input) || input.reservationDuration == null) {
    return ERROR_CODES.MISSING_RESERVATION_DURATION;
  }
  if (!("failureAppealRoute" in input) || input.failureAppealRoute == null) {
    return ERROR_CODES.MISSING_APPEAL_ROUTE;
  }
  const policy = input.correctionPolicy;
  if (!isPlainObject(policy) || !("maxCorrections" in policy) || policy.maxCorrections == null) {
    return ERROR_CODES.UNBOUNDED_CORRECTIONS;
  }
  if (typeof policy.maxCorrections === "number" && policy.maxCorrections < 0) {
    return ERROR_CODES.UNBOUNDED_CORRECTIONS;
  }
  return null;
}

/**
 * Parse and validate a funded-task terms document.
 * Never fetches `artifact.ref`, never evals artifact bytes, never transfers funds.
 */
export function parseTerms(input: unknown): ParseResult {
  const executable = findExecutablePayload(input);
  if (executable) {
    return {
      ok: false,
      code: ERROR_CODES.ARTIFACT_EXECUTABLE_PAYLOAD,
      message: `execution hint / inline untrusted code is forbidden (${executable.key}); artifact is metadata only`,
      path: executable.path,
    };
  }

  const money = findNumberMoney(input);
  if (money) {
    return {
      ok: false,
      code: ERROR_CODES.FLOAT_REWARD,
      message: money.message,
      path: money.path,
    };
  }

  const result = fundedTaskTermsSchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    const seeded = missingFieldCode(input);
    const code = seeded ?? (issue ? issueCode(issue, input) : ERROR_CODES.INVALID_INPUT);
    return {
      ok: false,
      code,
      message: issue?.message ?? "invalid funded-task terms",
      path: issue?.path ?? [],
    };
  }

  const termsVersion = hashTermsVersion(result.data);
  if (result.data.termsVersion && result.data.termsVersion !== termsVersion) {
    return {
      ok: false,
      code: ERROR_CODES.TERMS_VERSION_MISMATCH,
      message: "termsVersion does not match the canonical content hash",
      path: ["termsVersion"],
    };
  }

  const value: FundedTaskTerms & { termsVersion: TermsVersion } = {
    ...result.data,
    termsVersion,
  };
  return { ok: true, value };
}

/** Throwing form of `parseTerms` for F01/F04 call sites that want exceptions. */
export function assertTerms(input: unknown): FundedTaskTerms & { termsVersion: TermsVersion } {
  const parsed = parseTerms(input);
  if (!parsed.ok) {
    throw new TermsValidationError(parsed.message, parsed.code, parsed.path);
  }
  return parsed.value;
}
