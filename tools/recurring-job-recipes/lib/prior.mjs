import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { sha256Hex, stableStringify } from "./hash.mjs";

export const PRIOR_SCHEMA = "samedaydesk.recurring-job-prior.v1";

export function loadPrior(path) {
  if (!path || !existsSync(path)) {
    return { ok: false, code: "missing_prior", message: "immutable prior artifact is required" };
  }
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return { ok: false, code: "unreadable_prior", message: "cannot read prior artifact" };
  }
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch {
    return { ok: false, code: "invalid_prior_json", message: "prior artifact is not JSON" };
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return { ok: false, code: "invalid_prior_shape", message: "prior artifact must be an object" };
  }
  const sha256 = typeof doc.sha256 === "string" ? doc.sha256 : sha256Hex(doc.payload ?? doc);
  return {
    ok: true,
    path,
    prior: {
      schema: doc.schema || PRIOR_SCHEMA,
      recipeId: doc.recipeId ?? null,
      createdAt: doc.createdAt ?? null,
      sequence: Number.isInteger(doc.sequence) ? doc.sequence : 1,
      sha256,
      payload: doc.payload ?? doc,
      payment: doc.payment && typeof doc.payment === "object" ? doc.payment : { attempted: false },
      immutable: doc.immutable !== false,
    },
    bytes: Buffer.byteLength(raw),
  };
}

export function assertImmutable(priorPath, nextBytes) {
  if (!priorPath || !existsSync(priorPath)) return { ok: true };
  const existing = readFileSync(priorPath);
  if (Buffer.compare(existing, Buffer.from(nextBytes)) === 0) return { ok: true };
  return {
    ok: false,
    code: "prior_immutable",
    message: "refusing to overwrite an immutable prior artifact; write a new sequenced artifact instead",
  };
}

export function writeSequencedArtifact(dir, recipeId, sequence, body) {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${recipeId}.seq-${sequence}.json`);
  if (existsSync(path)) {
    return {
      ok: false,
      code: "artifact_exists",
      message: "sequenced artifact already exists; priors stay immutable",
      path,
    };
  }
  const text = `${stableStringify(body)}\n`;
  writeFileSync(path, text);
  return { ok: true, path, sha256: sha256Hex(text.trimEnd()), bytes: Buffer.byteLength(text) };
}

export function priorDirOf(filePath) {
  return dirname(filePath);
}
