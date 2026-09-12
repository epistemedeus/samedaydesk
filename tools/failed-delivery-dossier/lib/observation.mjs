import { ERROR_CODES } from "./pins.mjs";
import { isPlainObject } from "./json.mjs";
import { refuse } from "./refuse.mjs";

export const OBSERVATION_STATUSES = Object.freeze(["observed", "expected", "unrun", "fixture"]);

export const OUTCOME_KINDS = Object.freeze([
  "valid-analysis",
  "incomplete-delivery",
  "expected-paywall",
  "observed-paywall",
  "runtime-stop",
  "transport-failure",
  "refusal",
  "no-change",
  "missing-body",
  "engine-failure",
  "unknown",
]);

/** Small published contract. Consumers bind these fields; D01 may amend the wrapper separately. */
export const OBSERVATION_CONTRACT = Object.freeze({
  schema: "samedaydesk.failed-delivery-dossier.observation.v1",
  statuses: OBSERVATION_STATUSES,
  outcomeKinds: OUTCOME_KINDS,
  rules: Object.freeze([
    "expectedStatus 402 is never observationStatus observed",
    "claimed httpStatus without a local-runtime or external capture is expected, not observed",
    "unrun checks have pass false and observed false",
    "official source/state requires sha, gitHead, or http capture evidence",
    "valid analysis refusal is not transport-failure",
  ]),
});

export function is402(value) {
  return value === 402 || value === "402";
}

export function originClassOf(item = {}, body = {}) {
  if (typeof item.originClass === "string") return item.originClass;
  if (isPlainObject(item.origin) && typeof item.origin.class === "string") return item.origin.class;
  if (isPlainObject(item.observation) && typeof item.observation.class === "string") {
    return item.observation.class;
  }
  if (isPlainObject(body.origin) && typeof body.origin.class === "string") return body.origin.class;
  return null;
}

export function httpCaptureOf(item = {}) {
  const http = item.http || item.observation?.http || item.capture?.http;
  const cls = originClassOf(item);
  if (!http || typeof http.status !== "number") return null;
  if (cls !== "local-runtime" && cls !== "external") return null;
  return {
    class: cls,
    method: http.method || null,
    path: http.path || null,
    status: http.status,
  };
}

export function processCaptureOf(item = {}) {
  const cli = item.cli || item.observation?.cli;
  const cls = originClassOf(item);
  if (!cli || typeof cli.exitCode !== "number") return null;
  if (cls !== "local-runtime" && cls !== "external") return null;
  return { class: cls, exitCode: cli.exitCode, argv: Array.isArray(cli.argv) ? cli.argv : null };
}

/**
 * Unrun is never a pass and never observed, even if the caller sets matched.
 */
export function classifyCheck({
  id,
  ran = false,
  observed = false,
  matched = false,
  detail = null,
} = {}) {
  if (!id) {
    return { id: "unnamed", status: "unrun", pass: false, observed: false, detail: "missing check id" };
  }
  if (!ran) {
    return { id, status: "unrun", pass: false, observed: false, detail };
  }
  return {
    id,
    status: observed ? "observed" : "expected",
    pass: matched === true,
    observed: Boolean(observed),
    detail,
  };
}

export function classifyExtractHttp({ body = {}, item = {} } = {}) {
  const expected402 = is402(body.expectedStatus);
  const claimed402 = is402(body.httpStatus);
  const capture = httpCaptureOf(item);
  if (capture && capture.status >= 200 && capture.status < 300) {
    return {
      observationStatus: "observed",
      observedHttpStatus: capture.status,
      expectedStatus: expected402 || claimed402 ? 402 : null,
      outcomeKind: "incomplete-delivery",
      capture,
      notFailedDelivery: true,
    };
  }
  if (capture && capture.status === 402) {
    return {
      observationStatus: "observed",
      observedHttpStatus: 402,
      expectedStatus: expected402 || claimed402 ? 402 : 402,
      outcomeKind: "observed-paywall",
      capture,
    };
  }
  if (capture) {
    return {
      observationStatus: "observed",
      observedHttpStatus: capture.status,
      expectedStatus: expected402 || claimed402 ? 402 : null,
      outcomeKind: "transport-failure",
      capture,
    };
  }
  if (expected402 || claimed402) {
    return {
      observationStatus: "expected",
      observedHttpStatus: null,
      expectedStatus: 402,
      outcomeKind: "expected-paywall",
      capture: null,
    };
  }
  return null;
}

export function extractWhyNotInHand({ stop, recorded, classified }) {
  if (stop) {
    return (
      recorded ||
      "Buyer runtime stopped unpaid. No PAYMENT-SIGNATURE sent; extract output is not in hand."
    );
  }
  if (classified?.observationStatus === "observed" && classified.observedHttpStatus === 402) {
    const via = classified.capture
      ? `${classified.capture.class} ${classified.capture.method || "GET"} ${classified.capture.path || ""}`.trim()
      : "captured HTTP";
    return `Observed unpaid HTTP 402 (${via}). 402 is a paywall, not delivery.`;
  }
  if (classified?.outcomeKind === "transport-failure") {
    return `Observed HTTP ${classified.observedHttpStatus} from ${classified.capture?.class || "capture"}. That is a transport failure, not a catalog 402 expectation.`;
  }
  if (classified?.observationStatus === "expected") {
    return "Catalog or fixture expects unpaid HTTP 402. That expectation is not an observed response. Capture local-runtime or external HTTP to observe status.";
  }
  return "Extract unpaid evidence is not a delivery in hand.";
}

export function refuseBadObservationClaim(item = {}, body = {}) {
  const origin = isPlainObject(item.origin)
    ? item.origin
    : isPlainObject(body.origin)
      ? body.origin
      : {};
  const cls = originClassOf(item, body);
  const official =
    cls === "official" ||
    origin.official === true ||
    body.officialSource === true ||
    body.sourceState === "official";
  const evidence = isPlainObject(origin.evidence)
    ? origin.evidence
    : isPlainObject(item.evidence)
      ? item.evidence
      : null;
  if (official) {
    const has =
      isPlainObject(evidence) && Boolean(evidence.sha || evidence.gitHead || evidence.http);
    if (!has) {
      return refuse(
        ERROR_CODES.OFFICIAL_SOURCE_WITHOUT_EVIDENCE,
        "claimed official source/state needs evidence (sha, gitHead, or http capture)",
      );
    }
  }

  const claimsObserved =
    cls === "observed" ||
    origin.observed === true ||
    body.observed === true ||
    body.observationStatus === "observed";
  const runtimeClaim = cls === "local-runtime" || cls === "external";
  const http = httpCaptureOf(item);
  const proc = processCaptureOf(item);
  if ((claimsObserved || runtimeClaim) && !http && !proc) {
    return refuse(
      ERROR_CODES.CLAIMED_OBSERVED_WITHOUT_CAPTURE,
      "claimed observed or local-runtime/external status needs a captured HTTP status or CLI exitCode",
    );
  }
  return null;
}
