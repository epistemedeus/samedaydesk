import { sha256Hex } from "../../recurring-job-recipes/lib/hash.mjs";

const TEMPLATE_SCHEMA = "samedaydesk.compat-maintenance-occurrence.v1";

// Same skip set as tools/ae14-compat-maintenance/src/result.mjs finish().
const DIGEST_SKIP = new Set(["digest", "executed", "readback"]);

export function sealedDigest(body) {
  const view = {};
  for (const key of Object.keys(body).sort()) {
    if (!DIGEST_SKIP.has(key)) view[key] = body[key];
  }
  return sha256Hex(view);
}

export function consumeTemplateResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return { ok: false, code: "not_template_result" };
  }
  if (result.schema !== TEMPLATE_SCHEMA) return { ok: false, code: "not_template_result" };
  if (typeof result.occurrenceId !== "string" || result.occurrenceId.length < 1) {
    return { ok: false, code: "not_template_result" };
  }
  if (typeof result.taskId !== "string" || result.taskId.length < 1) {
    return { ok: false, code: "not_template_result" };
  }
  if (typeof result.digest !== "string" || !/^[0-9a-f]{64}$/.test(result.digest)) {
    return { ok: false, code: "result_digest_mismatch" };
  }
  if (sealedDigest(result) !== result.digest) return { ok: false, code: "result_digest_mismatch" };
  if (
    result.supplier228200?.rerun !== false
    || result.timerStarted !== false
    || result.wroteQueue !== false
    || result.finiteQueue228300?.copied !== false
  ) {
    return { ok: false, code: "not_finite" };
  }
  return { ok: true, result };
}

export function projectTemplate(result) {
  const change = Array.isArray(result.change)
    ? result.change.filter((row) => row && typeof row.field === "string").map((row) => row.field)
    : [];
  return {
    consumedSchema: result.schema,
    consumedDigest: result.digest,
    occurrenceId: result.occurrenceId,
    taskId: result.taskId,
    distinctTaskId: typeof result.distinctTaskId === "string" ? result.distinctTaskId : null,
    disposition: typeof result.disposition === "string" ? result.disposition : null,
    usefulness: typeof result.usefulness === "string" ? result.usefulness : null,
    acceptance: typeof result.acceptance === "string" ? result.acceptance : null,
    retainedSkuReused: result.retainedSkuReused === true,
    detected: typeof result.detected === "string" ? result.detected : null,
    useful: result.useful === true,
    change,
  };
}
