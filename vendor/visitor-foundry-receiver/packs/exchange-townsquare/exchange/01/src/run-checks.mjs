import {
  CHECK_KIND,
  CHECK_RESULT_SCHEMA,
  SUBJECTIVE_STATUS,
} from "./constants.mjs";
import { readPath } from "./path.mjs";
import { ERROR_CODES } from "./constants.mjs";
import { isPlainObject, briefError } from "./validate.mjs";

const SHA256_RE = /^[a-f0-9]{64}$/i;
const HTTPS_RE = /^https:\/\/[^\s/$.?#].[^\s]*$/i;

/**
 * Run only objective checks from a brief against a submitted artifact.
 * Subjective criteria are echoed as unresolved — never auto-passed.
 */
export function runAcceptanceChecks(brief, artifact, { clock = () => Date.now() } = {}) {
  if (!isPlainObject(brief)) {
    throw briefError(ERROR_CODES.INVALID_INPUT, "brief must be an object");
  }
  if (!Array.isArray(brief.objectiveChecks)) {
    throw briefError(ERROR_CODES.INVALID_INPUT, "brief.objectiveChecks must be an array");
  }
  if (artifact === undefined) {
    throw briefError(ERROR_CODES.INVALID_INPUT, "artifact is required");
  }

  const objectiveResults = brief.objectiveChecks.map((criterion) =>
    runOneCheck(criterion, artifact),
  );
  const subjectiveResults = (brief.subjectiveCriteria || []).map((criterion) => ({
    id: criterion.id,
    class: "subjective",
    status: SUBJECTIVE_STATUS.UNRESOLVED,
    passed: null,
    detail: criterion.reviewHint || "Human review required; not machine-resolved.",
  }));

  const passed = objectiveResults.filter((r) => r.passed === true).length;
  const failed = objectiveResults.filter((r) => r.passed === false).length;
  const objectiveLayer =
    objectiveResults.length === 0 ? "not_applicable" : failed === 0 ? "complete" : "incomplete";
  const objectiveComplete = objectiveLayer === "complete";

  return {
    schema: CHECK_RESULT_SCHEMA,
    ranAt: new Date(clock()).toISOString(),
    taskId: brief.taskId ?? null,
    objective: {
      total: objectiveResults.length,
      passed,
      failed,
      complete: objectiveComplete,
      layer: objectiveLayer,
      results: objectiveResults,
    },
    subjective: {
      total: subjectiveResults.length,
      unresolved: subjectiveResults.length,
      results: subjectiveResults,
    },
    overall: {
      objectiveComplete,
      objectiveLayer,
      subjectiveUnresolved: subjectiveResults.length > 0,
      // Never claim full acceptance while subjective remain unresolved.
      accepted: false,
      note:
        objectiveLayer === "not_applicable"
          ? subjectiveResults.length
            ? "No objective layer; subjective criteria remain unresolved — full acceptance is not claimed."
            : "No objective layer. Empty objective evidence is not automatic acceptance."
          : subjectiveResults.length
            ? "Objective layer evaluated; subjective criteria remain unresolved — full acceptance is not claimed."
            : objectiveComplete
              ? "All objective checks passed; no subjective criteria present."
              : "One or more objective checks failed.",
    },
  };
}

function runOneCheck(criterion, artifact) {
  const check = criterion.check || {};
  const base = {
    id: criterion.id,
    class: "objective",
    kind: check.kind,
  };
  try {
    const outcome = evaluate(check, artifact);
    return { ...base, passed: outcome.passed, detail: outcome.detail };
  } catch (err) {
    return {
      ...base,
      passed: false,
      detail: err.message || String(err),
    };
  }
}

function evaluate(check, artifact) {
  const kind = check.kind;
  switch (kind) {
    case CHECK_KIND.JSON_PATH_EXISTS: {
      const got = readPath(artifact, check.path);
      return {
        passed: got.ok,
        detail: got.ok ? `path ${check.path} present` : `path ${check.path} missing (${got.reason})`,
      };
    }
    case CHECK_KIND.JSON_PATH_EQUALS: {
      const got = readPath(artifact, check.path);
      if (!got.ok) return { passed: false, detail: `path ${check.path} missing` };
      const passed = Object.is(got.value, check.equals) || valuesEqual(got.value, check.equals);
      return {
        passed,
        detail: passed
          ? `path ${check.path} equals expected`
          : `path ${check.path} expected ${JSON.stringify(check.equals)} got ${JSON.stringify(got.value)}`,
      };
    }
    case CHECK_KIND.JSON_PATH_TYPE: {
      const got = readPath(artifact, check.path);
      if (!got.ok) return { passed: false, detail: `path ${check.path} missing` };
      const actual = got.value === null ? "null" : Array.isArray(got.value) ? "array" : typeof got.value;
      const passed = actual === check.type;
      return {
        passed,
        detail: passed
          ? `path ${check.path} is ${check.type}`
          : `path ${check.path} type ${actual}, expected ${check.type}`,
      };
    }
    case CHECK_KIND.STRING_MAX_LENGTH: {
      const got = readPath(artifact, check.path);
      if (!got.ok) return { passed: false, detail: `path ${check.path} missing` };
      if (typeof got.value !== "string") {
        return { passed: false, detail: `path ${check.path} is not a string` };
      }
      const passed = got.value.length <= check.max;
      return {
        passed,
        detail: passed
          ? `length ${got.value.length} <= ${check.max}`
          : `length ${got.value.length} > ${check.max}`,
      };
    }
    case CHECK_KIND.ARRAY_MIN_LENGTH: {
      const got = readPath(artifact, check.path);
      if (!got.ok) return { passed: false, detail: `path ${check.path} missing` };
      if (!Array.isArray(got.value)) {
        return { passed: false, detail: `path ${check.path} is not an array` };
      }
      const passed = got.value.length >= check.min;
      return {
        passed,
        detail: passed
          ? `array length ${got.value.length} >= ${check.min}`
          : `array length ${got.value.length} < ${check.min}`,
      };
    }
    case CHECK_KIND.ENUM_IN: {
      const got = readPath(artifact, check.path);
      if (!got.ok) return { passed: false, detail: `path ${check.path} missing` };
      const passed = check.values.some((v) => valuesEqual(v, got.value));
      return {
        passed,
        detail: passed
          ? `value in enum`
          : `value ${JSON.stringify(got.value)} not in enum`,
      };
    }
    case CHECK_KIND.HTTPS_URL_SHAPE: {
      const got = readPath(artifact, check.path);
      if (!got.ok) return { passed: false, detail: `path ${check.path} missing` };
      if (typeof got.value !== "string") {
        return { passed: false, detail: `path ${check.path} is not a string` };
      }
      let passed = false;
      try {
        const u = new URL(got.value);
        passed = u.protocol === "https:";
      } catch {
        passed = false;
      }
      // Prefer URL parser; keep regex as soft secondary signal in detail only.
      return {
        passed,
        detail: passed
          ? `https URL shape ok`
          : `not an https URL (${HTTPS_RE.test(got.value) ? "regex-ok parser-fail" : "invalid"})`,
      };
    }
    case CHECK_KIND.SHA256_HEX: {
      const got = readPath(artifact, check.path);
      if (!got.ok) return { passed: false, detail: `path ${check.path} missing` };
      if (typeof got.value !== "string") {
        return { passed: false, detail: `path ${check.path} is not a string` };
      }
      const passed = SHA256_RE.test(got.value);
      return {
        passed,
        detail: passed ? "sha256 hex ok" : "expected 64-char hex digest",
      };
    }
    case CHECK_KIND.REGEX_MATCH: {
      const got = readPath(artifact, check.path);
      if (!got.ok) return { passed: false, detail: `path ${check.path} missing` };
      if (typeof got.value !== "string") {
        return { passed: false, detail: `path ${check.path} is not a string` };
      }
      const re = new RegExp(check.pattern);
      const passed = re.test(got.value);
      return {
        passed,
        detail: passed ? "regex matched" : `regex ${check.pattern} did not match`,
      };
    }
    default:
      return { passed: false, detail: `unsupported check kind ${kind}` };
  }
}

function valuesEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a === "object" && typeof b === "object" && a && b) {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}
