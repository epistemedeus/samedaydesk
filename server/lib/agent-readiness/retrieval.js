// Classifies one probe response before a document check decides it is missing or invalid.
const ABSENT_STATUSES = new Set([404, 410]);
const REFUSAL_STATUSES = new Set([401, 403, 407, 429, 451]);
const CHALLENGE_MARKERS = [
  "just a moment",
  "challenge-platform",
  "cf-challenge",
  "cdn-cgi/challenge",
  "checking your browser",
  "enable javascript and cookies",
  "attention required",
];

export function contentTypeOf(res) {
  return String(res?.contentType || res?.headers?.["content-type"] || "").split(";")[0].trim().toLowerCase();
}

export function isHtmlDocument(res) {
  const type = contentTypeOf(res);
  if (type === "text/html" || type === "application/xhtml+xml") return true;
  const body = String(res?.body || "").slice(0, 200).trim().toLowerCase();
  return body.startsWith("<!doctype html") || body.startsWith("<html");
}

export function looksLikeChallenge(res) {
  if (!res) return false;
  const headers = res.headers || {};
  if (typeof headers["cf-mitigated"] === "string" && headers["cf-mitigated"]) return true;
  const status = Number(res.status) || 0;
  const html = isHtmlDocument(res);
  if (!html && status !== 403 && status !== 503 && status !== 429) return false;
  const blob = String(res.body || "").slice(0, 2500).toLowerCase();
  if (CHALLENGE_MARKERS.some((marker) => blob.includes(marker))) return true;
  return status === 403 && html;
}

export function classifyRetrieval(res) {
  if (!res || typeof res.status !== "number") return { kind: "unavailable", status: null, challenge: false };
  const status = res.status;
  const challenge = looksLikeChallenge(res);
  if (res.error === "timeout") return { kind: "failed", status, failure: "timeout", challenge };
  if (status === 0) return { kind: "failed", status, failure: res.error || "connection", challenge };
  if (challenge || REFUSAL_STATUSES.has(status)) return { kind: "blocked", status, challenge };
  if (ABSENT_STATUSES.has(status)) return { kind: "absent", status, challenge: false };
  if (status === 408 || status >= 500 || (status >= 300 && status < 400) || status < 200) {
    return { kind: "failed", status, failure: `http-${status}`, challenge: false };
  }
  if (status >= 300) return { kind: "failed", status, failure: `http-${status}`, challenge: false };
  if (res.truncated) return { kind: "budget", status, challenge: false };
  return { kind: "retrieved", status, challenge: false };
}

export function selectDocument(bundle, paths) {
  const attempts = paths.map((path) => {
    const res = bundle.responses?.[path];
    return { path, res, outcome: classifyRetrieval(res) };
  });
  const chosen = attempts.find((attempt) => attempt.outcome.kind === "retrieved") || null;
  const blocking = chosen ? null : attempts.find((attempt) => (
    attempt.outcome.kind === "blocked" || attempt.outcome.kind === "failed" || attempt.outcome.kind === "budget"
  )) || null;
  return { attempts, chosen, blocking };
}

export function retrievalDiagnostic(pathLabel, outcome, noun = "document") {
  if (!outcome || outcome.kind === "absent" || outcome.kind === "unavailable" || outcome.kind === "retrieved") {
    return null;
  }
  if (outcome.kind === "blocked") {
    const how = outcome.challenge ? `an HTTP ${outcome.status} challenge` : `HTTP ${outcome.status}`;
    return {
      reason: `Retrieval of ${pathLabel} was refused (${how}). The ${noun} was not read, so this is not evidence it is absent or invalid.`,
      fix: `Fetch ${pathLabel} with a client that receives the ${noun}, then rerun this check. A refusal is not fixed by publishing a replacement before the body can be read.`,
    };
  }
  if (outcome.kind === "budget") {
    return {
      reason: `Retrieval of ${pathLabel} returned HTTP ${outcome.status}, but the body was cut at the existing probe body budget before it could be judged.`,
      fix: `Rerun ${pathLabel} when the full body fits the existing probe body budget. Do not treat the partial body as a schema error or as a missing file.`,
    };
  }
  const how = outcome.failure === "timeout"
    ? "the probe timed out"
    : outcome.failure === "connection"
      ? "the connection failed"
      : `HTTP ${outcome.status}`;
  const retry = outcome.failure === "timeout"
    ? `Retry ${pathLabel}. A timeout is not evidence the file is missing.`
    : `Retry ${pathLabel}. The response did not yield a readable ${noun}, so this is not evidence the file is missing.`;
  return {
    reason: `Retrieval of ${pathLabel} failed (${how}). The ${noun} was not read, so this is not evidence it is absent or invalid.`,
    fix: retry,
  };
}

export function textDocumentVerdict(res, pathLabel, publishFix) {
  const outcome = classifyRetrieval(res);
  const diagnostic = retrievalDiagnostic(pathLabel, outcome);
  if (diagnostic) return { status: "fail", reason: diagnostic.reason, fix: diagnostic.fix };
  if (outcome.kind !== "retrieved") {
    return {
      status: "fail",
      reason: `${pathLabel} returned ${res?.status ?? "no response"}.`,
      fix: publishFix,
    };
  }
  if (isHtmlDocument(res)) {
    const type = contentTypeOf(res) || "HTML";
    return {
      status: "fail",
      reason: `${pathLabel} returned HTTP ${outcome.status} as ${type}, not the text document this check reads.`,
      fix: `Serve ${pathLabel} as plain text or Markdown. An HTML page is a different document, not proof the text file is missing.`,
    };
  }
  const body = String(res?.body || "");
  if (!body.trim()) {
    return { status: "fail", reason: `${pathLabel} returned ${res.status}.`, fix: publishFix };
  }
  return {
    status: "pass",
    reason: `${pathLabel} returned ${res.status} with ${body.length} bytes.`,
    fix: publishFix,
  };
}

export function inspectJsonBody(res, pathLabel) {
  const outcome = classifyRetrieval(res);
  if (outcome.kind !== "retrieved") return { state: outcome.kind, outcome, value: null };
  let parsed;
  try {
    parsed = JSON.parse(String(res.body || ""));
  } catch {
    parsed = undefined;
  }
  const type = contentTypeOf(res);
  if (isHtmlDocument(res) || (type && !/json/.test(type) && parsed === undefined)) {
    return {
      state: "wrong-type",
      outcome,
      value: null,
      reason: `${pathLabel} returned HTTP ${outcome.status} as ${type || "HTML"}, which is not a JSON document.`,
      fix: `Serve JSON at ${pathLabel}. The wrong content type is not evidence the path is missing.`,
    };
  }
  if (parsed === undefined) {
    return {
      state: "invalid-json",
      outcome,
      value: null,
      reason: `${pathLabel} returned HTTP ${outcome.status} but the body is not valid JSON.`,
      fix: `Replace the body at ${pathLabel} with valid JSON. The response was retrieved, so this is not a missing file.`,
    };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      state: "invalid-schema",
      outcome,
      value: null,
      reason: `${pathLabel} is valid JSON but not a JSON object, so it is not a usable document.`,
      fix: `Serve a JSON object at ${pathLabel}. The path was retrieved; the schema is what failed.`,
    };
  }
  return {
    state: "object",
    outcome,
    value: parsed,
    reason: `${pathLabel} parsed as JSON.`,
  };
}
