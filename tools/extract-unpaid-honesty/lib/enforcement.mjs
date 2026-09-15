export const ENFORCEMENT_SCHEMA = "samedaydesk.extract-unpaid-honesty.enforcement.v1";
export const ENFORCEMENT_KIND = "js-hooks+path-stub+proxy-env";

export const ENFORCEMENT_COVERS = Object.freeze([
  "node:fetch via NODE_OPTIONS --import fetch-guard",
  "node:http request/get via NODE_OPTIONS --import",
  "node:https request/get via NODE_OPTIONS --import",
  "first PATH entries named curl and wget",
  "local 127.0.0.1 HTTP server for clients that actually use HTTP(S)_PROXY/ALL_PROXY",
]);

export const ENFORCEMENT_DOES_NOT_COVER = Object.freeze([
  "OS network namespaces, seccomp, iptables, or any other kernel isolation",
  "absolute-path binaries that skip PATH stubs",
  "raw node:net / node:tls sockets",
  "child processes that unset NODE_OPTIONS",
  "non-Node runtimes",
  "HTTP clients that ignore HTTP_PROXY/HTTPS_PROXY/ALL_PROXY",
]);

export function enforcementContract() {
  return {
    schema: ENFORCEMENT_SCHEMA,
    kind: ENFORCEMENT_KIND,
    osIsolation: false,
    covers: [...ENFORCEMENT_COVERS],
    doesNotCover: [...ENFORCEMENT_DOES_NOT_COVER],
    paymentAttemptDetection: {
      promised: true,
      channels: ["inspectRequest", "intercept log", "CLI probe-extract"],
      liveMerchantGet: false,
    },
    class: "local-runtime",
  };
}

export function observedMustNotRunMarkers(mustNotRun, blob) {
  const text = String(blob || "");
  const observed = [];
  for (const item of mustNotRun || []) {
    const marker = String(item || "");
    if (marker && text.includes(marker)) observed.push(marker);
  }
  return observed;
}

export function observeMustNotRun({ text, mustNotRun } = {}) {
  const listed = [...(mustNotRun || [])];
  const observed = observedMustNotRunMarkers(listed, text);
  return {
    schema: "samedaydesk.extract-unpaid-honesty.must-not-run.v1",
    osIsolation: false,
    evidenceClass: "stdout-stderr-text-scan",
    mustNotRun: listed,
    mustNotRunObserved: observed,
    mustNotRunPreserved: observed.length === 0,
    purchaseAuthority: false,
    sold: false,
    settled: false,
  };
}

export function paymentAttemptFromHits(hits) {
  return (hits || []).some(
    (hit) =>
      hit &&
      hit.forbidden &&
      (hit.reasons || []).some(
        (reason) =>
          reason === "extract-url" ||
          reason === "extract-batch-url" ||
          reason === "seller-integrity-url" ||
          reason === "payment-header",
      ),
  );
}

export function classifyHonestyOutcome({
  jobOk,
  paymentAttemptDetected,
  mustNotRunObserved,
  spawnError,
} = {}) {
  if (paymentAttemptDetected) {
    return {
      outcomeClass: "payment-attempt-detected",
      analysis: "payment-attempt",
      transport: "ok",
      engine: jobOk ? "ok" : "not-success",
    };
  }
  if (spawnError) {
    return {
      outcomeClass: "engine-or-spawn-failure",
      analysis: "not-evaluated",
      transport: "ok",
      engine: "failed",
    };
  }
  if (!jobOk) {
    return {
      outcomeClass: "engine-or-spawn-failure",
      analysis: "not-evaluated",
      transport: "ok",
      engine: "failed",
    };
  }
  if ((mustNotRunObserved || []).length > 0) {
    return {
      outcomeClass: "must-not-run-text-observed",
      analysis: "must-not-run-marker-in-job-text",
      transport: "ok",
      engine: "ok",
    };
  }
  return {
    outcomeClass: "valid-unpaid",
    analysis: "unpaid-catalog-job",
    transport: "ok",
    engine: "ok",
  };
}
