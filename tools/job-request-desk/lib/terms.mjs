import { SCHEMA_VERSION, TERMS_SCHEMA, enginePin } from "./pins.mjs";
import { refuse } from "./refuse.mjs";
import {
  hashTermsVersion,
  isTermsVersionHash,
} from "./vendor/funded-task-terms/hash.mjs";

/**
 * Job-request terms for I01's content-hash hasher.
 * schemaVersion is the integer shape. termsVersion is sha256: + 64 hex.
 * Original F01 integer termsVersion is rejected (no silent dual-key).
 */
export function assertTermsVersionNotInteger(value) {
  if (value == null || value === false || value === "") return;
  if (typeof value === "number" || (typeof value === "string" && /^-?\d+$/.test(value))) {
    throw refuse("invalid_input", "integer termsVersion is rejected; I01 termsVersion is a content hash", {
      termsVersion: value,
    });
  }
  if (!isTermsVersionHash(value)) {
    throw refuse("invalid_input", "termsVersion must be sha256: plus 64 lowercase hex", { termsVersion: value });
  }
}

export function buildTermsBody({ engineId, inputs, orderId, example }) {
  const pin = enginePin();
  const body = {
    schema: TERMS_SCHEMA,
    schemaVersion: SCHEMA_VERSION,
    engineId,
    enginePin: {
      package: pin.package,
      version: pin.version,
      sha256: pin.sha256,
      bytes: pin.bytes,
    },
    inputs: [...inputs]
      .map((row) => ({
        flag: row.flag,
        sha256: row.sha256,
        bytes: row.bytes,
      }))
      .sort((a, b) => a.flag.localeCompare(b.flag)),
    example: Boolean(example),
  };
  if (orderId) body.orderId = String(orderId);
  return body;
}

export function hashJobRequestTerms(body) {
  return hashTermsVersion(body);
}

export function requestIdFromTermsVersion(termsVersion) {
  if (!isTermsVersionHash(termsVersion)) {
    throw refuse("invalid_input", "termsVersion is not an I01 content hash", { termsVersion });
  }
  return termsVersion.slice("sha256:".length);
}

export function identityFromTerms({ engineId, inputs, orderId, example, callerTermsVersion }) {
  assertTermsVersionNotInteger(callerTermsVersion);
  const body = buildTermsBody({ engineId, inputs, orderId, example });
  const termsVersion = hashJobRequestTerms(body);
  if (callerTermsVersion && callerTermsVersion !== termsVersion) {
    throw refuse("digest-mismatch", "declared termsVersion does not match hashed terms", {
      declared: callerTermsVersion,
      computed: termsVersion,
    });
  }
  return {
    terms: body,
    termsVersion,
    requestId: requestIdFromTermsVersion(termsVersion),
  };
}
