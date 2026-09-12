import { createHash } from "node:crypto";
import { TERMS_SCHEMA, TERMS_SCHEMA_VERSION, TERMS_VERSION_PREFIX } from "./constants.mjs";
import { canonicalize, isPlainObject } from "./canonical.mjs";

/**
 * I01 integrated hash-terms contract (Neo PR54): `sha256:` + 64 lowercase hex.
 * Integer `termsVersion` is rejected. Original F01 integer key is not used.
 *
 * Inject `hashTermsVersion` to bind later to Neo `packs/funded-task-terms`.
 * Default hasher is the same content-hash format, applied to this job's terms body.
 */
export function assertTermsVersion(value) {
  if (typeof value === "number") {
    const error = new Error("integer termsVersion is rejected; use sha256: + 64 hex");
    error.code = "integer_terms_version";
    throw error;
  }
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    const error = new Error("termsVersion must be sha256: plus 64 lowercase hex");
    error.code = "invalid_terms_version";
    throw error;
  }
  return value;
}

export function localHashTermsVersion(input) {
  if (!isPlainObject(input)) {
    throw new Error("hashTermsVersion requires a terms object");
  }
  if (typeof input.termsVersion === "number") {
    const error = new Error("integer termsVersion is rejected; use sha256: + 64 hex");
    error.code = "integer_terms_version";
    throw error;
  }
  const copy = { ...input };
  delete copy.termsVersion;
  const digest = createHash("sha256").update(canonicalize(copy), "utf8").digest("hex");
  return `${TERMS_VERSION_PREFIX}${digest}`;
}

export async function resolveHasher(injected) {
  if (typeof injected === "function") return injected;
  const moduleUrl = process.env.FUNDED_TASK_TERMS_MODULE;
  if (moduleUrl) {
    const mod = await import(moduleUrl);
    if (typeof mod.hashTermsVersion !== "function") {
      throw new Error("FUNDED_TASK_TERMS_MODULE must export hashTermsVersion");
    }
    return (input) => mod.hashTermsVersion(input);
  }
  return localHashTermsVersion;
}

export function jobTermsBody({ fields, clock, beforeSha256, afterSha256 }) {
  return {
    schema: TERMS_SCHEMA,
    schemaVersion: TERMS_SCHEMA_VERSION,
    fields: [...fields],
    clock,
    beforeSha256,
    afterSha256,
  };
}

export async function hashJobTerms(body, { hasher } = {}) {
  const fn = await resolveHasher(hasher);
  return fn(body);
}

export function sha256Hex(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}
