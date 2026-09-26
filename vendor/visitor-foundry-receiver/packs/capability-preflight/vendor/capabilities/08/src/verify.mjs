/**
 * Thin local verification of a caller-supplied fixture artifact.
 * NOT Cap06 evidence-binding (Heavy S138-owned) — only requiredFields +
 * a few simple objective checks from the Cap01 envelope.
 */
import { evidenceBindingStubMeta } from "./stubs/evidence.mjs";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getPath(obj, path) {
  if (typeof path !== "string" || !path.trim()) return undefined;
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts) {
    if (!isPlainObject(cur) && !Array.isArray(cur)) return undefined;
    if (!Object.prototype.hasOwnProperty.call(cur, p)) return undefined;
    cur = cur[p];
  }
  return cur;
}

/** JSON equality used by Cap01 `check.equals` (no extra identity framework). */
export function jsonEquals(left, right) {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right) return false;
  if (left === null || right === null) return left === right;
  if (typeof left !== "object") return left === right;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function runCheck(artifact, check) {
  if (!isPlainObject(check) || typeof check.kind !== "string") {
    return { ok: false, reason: "invalid_check" };
  }
  const value = getPath(artifact, check.path);
  switch (check.kind) {
    case "json_path_exists":
      return {
        ok: value !== undefined,
        reason: value === undefined ? `missing:${check.path}` : null,
      };
    case "json_path_type": {
      const t = check.type;
      let actual =
        value === null
          ? "null"
          : Array.isArray(value)
            ? "array"
            : typeof value;
      return {
        ok: actual === t,
        reason: actual === t ? null : `type:${check.path}:expected_${t}:got_${actual}`,
      };
    }
    case "json_path_equals": {
      // Cap01 validateCheckShape requires `equals`. Missing paths never match.
      if (value === undefined) {
        return { ok: false, reason: `missing:${check.path}` };
      }
      if (!Object.prototype.hasOwnProperty.call(check, "equals")) {
        return { ok: false, reason: `equals_missing:${check.path}` };
      }
      const ok = jsonEquals(value, check.equals);
      return {
        ok,
        reason: ok ? null : `equals:${check.path}`,
      };
    }
    case "string_max_length": {
      if (typeof value !== "string") {
        return { ok: false, reason: `not_string:${check.path}` };
      }
      const max = Number(check.max);
      return {
        ok: value.length <= max,
        reason: value.length <= max ? null : `too_long:${check.path}`,
      };
    }
    case "https_url_shape": {
      const ok =
        typeof value === "string" && /^https:\/\/[^\s]+$/i.test(value.trim());
      return { ok, reason: ok ? null : `https_url:${check.path}` };
    }
    case "sha256_hex": {
      const ok = typeof value === "string" && /^[a-f0-9]{64}$/i.test(value.trim());
      return { ok, reason: ok ? null : `sha256:${check.path}` };
    }
    case "regex_match": {
      if (typeof value !== "string" || typeof check.pattern !== "string") {
        return { ok: false, reason: `regex_input:${check.path}` };
      }
      try {
        const re = new RegExp(check.pattern);
        const ok = re.test(value);
        return { ok, reason: ok ? null : `regex:${check.path}` };
      } catch {
        return { ok: false, reason: `bad_regex:${check.path}` };
      }
    }
    case "array_min_length": {
      if (!Array.isArray(value)) return { ok: false, reason: `not_array:${check.path}` };
      const min = Number(check.min ?? 0);
      return {
        ok: value.length >= min,
        reason: value.length >= min ? null : `array_short:${check.path}`,
      };
    }
    case "enum_in": {
      const allowed = Array.isArray(check.values) ? check.values : [];
      const ok = allowed.includes(value);
      return { ok, reason: ok ? null : `enum:${check.path}` };
    }
    default:
      // Unknown kinds are skipped (not Cap06) — do not invent failures.
      return { ok: true, reason: null, skipped: true, kind: check.kind };
  }
}

/**
 * Verify supplied artifact against envelope outputConstraints.
 */
export function verifySuppliedArtifact(artifact, envelope) {
  const evidenceMeta = evidenceBindingStubMeta();
  if (!isPlainObject(artifact)) {
    return {
      stageId: "verify",
      implementation: "thin_local",
      status: "failed",
      ok: false,
      failures: ["artifact_not_object"],
      checks: [],
      ...evidenceMeta,
    };
  }

  const constraints = envelope?.outputConstraints;
  if (!isPlainObject(constraints)) {
    return {
      stageId: "verify",
      implementation: "thin_local",
      status: "failed",
      ok: false,
      failures: ["missing_output_constraints"],
      checks: [],
      ...evidenceMeta,
    };
  }

  const checks = [];
  const failures = [];

  for (const field of constraints.requiredFields || []) {
    const value = getPath(artifact, field);
    const ok = value !== undefined;
    checks.push({ id: `required:${field}`, kind: "json_path_exists", ok });
    if (!ok) failures.push(`required:${field}`);
  }

  for (const oc of constraints.objectiveChecks || []) {
    const result = runCheck(artifact, oc.check);
    checks.push({
      id: oc.id,
      kind: oc.check?.kind ?? null,
      ok: result.ok,
      skipped: result.skipped === true,
      reason: result.reason,
    });
    if (!result.ok && !result.skipped) {
      failures.push(result.reason || oc.id);
    }
  }

  const ok = failures.length === 0;
  return {
    stageId: "verify",
    implementation: "thin_local",
    status: ok ? "ok" : "failed",
    ok,
    failures,
    checks,
    ...evidenceMeta,
  };
}
