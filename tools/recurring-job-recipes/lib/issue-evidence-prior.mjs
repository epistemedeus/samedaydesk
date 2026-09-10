/**
 * Optional prior loading for issue-evidence.
 * Present priors stay immutable. Absent prior means first observation.
 */

import { assertImmutable, PRIOR_SCHEMA } from "./prior.mjs";
import { constants, openSync, closeSync, fstatSync, readSync, lstatSync } from "node:fs";
import path from "node:path";
import { sha256Hex } from "./hash.mjs";

export function readIssueEvidenceJson(file) {
  let current = path.resolve(file);
  for (;;) {
    if (lstatSync(current).isSymbolicLink()) throw new Error("symlink input refused");
    const parent = path.dirname(current); if (parent === current) break; current = parent;
  }
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd); const max = 4 * 1024 * 1024;
    if (!stat.isFile() || stat.size > max) throw new Error("input must be a bounded regular JSON file");
    const bytes = Buffer.alloc(max + 1); let used = 0, n;
    while (used < bytes.length && (n = readSync(fd, bytes, used, bytes.length-used, null))) used += n;
    if (used > max) throw new Error("input exceeds byte limit");
    return { doc: JSON.parse(bytes.subarray(0,used).toString("utf8")), bytes: used };
  } finally { closeSync(fd); }
}

export function loadOptionalPrior(priorPath) {
  if (!priorPath) {
    return { ok: true, present: false, prior: null, path: null };
  }
  try {
    const { doc, bytes } = readIssueEvidenceJson(priorPath);
    if (!doc || typeof doc !== "object" || Array.isArray(doc) || doc.immutable === false || (doc.recipeId && doc.recipeId !== "issue-evidence")) throw new Error("invalid issue-evidence prior");
    const payload = doc.payload ?? doc;
    const digest = sha256Hex(payload);
    if (doc.sha256 && doc.sha256 !== digest) throw new Error("prior payload digest mismatch");
    return { ok: true, present: true, path: priorPath, bytes, prior: {
      schema: doc.schema || PRIOR_SCHEMA, recipeId: doc.recipeId || "issue-evidence", createdAt: doc.createdAt || null,
      sequence: doc.sequence || 1, immutable: true, sha256: digest, payload, payment: doc.payment || { attempted: false },
    } };
  } catch (error) { return { ok: false, present: true, code: "invalid_prior", message: error.message }; }

}

export function assertPriorImmutable(priorPath, nextBytes) {
  return assertImmutable(priorPath, nextBytes);
}

export function priorObservationPayload(prior) {
  if (!prior) return null;
  if (prior.payload?.observation) {
    return {
      observation: prior.payload.observation,
      fingerprint: prior.payload.fingerprint || null,
    };
  }
  if (prior.payload?.evidence?.observation) {
    return {
      observation: prior.payload.evidence.observation,
      fingerprint: prior.payload.evidence.fingerprint || null,
    };
  }
  return null;
}
