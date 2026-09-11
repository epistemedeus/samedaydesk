import { DOMAIN_ANALYSIS } from "./pins.mjs";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function engineJsonOf(result) {
  const engine = result?.engine;
  if (!isPlainObject(engine)) return null;
  if (isPlainObject(engine.json)) return engine.json;
  if (typeof engine.ok === "boolean" || engine.status != null || engine.refused === true) return engine;
  return null;
}

export function engineProcessOf(result) {
  const engine = result?.engine;
  if (!isPlainObject(engine)) return null;
  if (typeof engine.status === "number") return engine;
  return null;
}

function analysisFromJson(json) {
  if (!json) {
    return { status: "not-run", outcome: "not-run", identityVerified: null };
  }
  const identityVerified = typeof json.identityVerified === "boolean" ? json.identityVerified : null;
  if (json.ok === false || json.refused === true) {
    return { status: json.status || "refused", outcome: "refused", identityVerified };
  }
  if (json.status === "informational" || json.status === "partial" || json.status === "actionable") {
    return { status: json.status, outcome: json.status, identityVerified };
  }
  return {
    status: json.status || "completed",
    outcome: "completed",
    identityVerified,
  };
}

export function splitWrapperResult(result = {}) {
  if (result.transport && result.analysis && result.delivery) {
    return {
      source: "execution-v1",
      contract: result.contract || "samedaydesk.paid-useful-jobs.execution.v1",
      transport: result.transport,
      analysis: {
        status: result.analysis.status || "not-run",
        outcome: result.analysis.outcome || result.analysis.status || "not-run",
        identityVerified: result.analysis.identityVerified ?? null,
      },
      delivery: result.delivery,
      fundingState: result.fundingState || "unfunded",
      sold: result.sold === true,
      sample: result.sample === true,
      purchaseAuthority: result.purchaseAuthority === true,
      code: result.code || null,
      wrapperOk: result.ok === true,
    };
  }

  const json = engineJsonOf(result);
  const process = engineProcessOf(result);
  const code = result.code || null;
  const outputs = Array.isArray(result.outputs) ? result.outputs : [];
  const expected = result.delivery?.expected || outputs.map((row) => row.name).filter(Boolean);

  let transport = "not-observed";
  if (code === "kit-acquisition-failed") transport = "acquisition-failed";
  else if (
    [
      "missing-job",
      "unknown-job",
      "missing-required-inputs",
      "sample-not-a-sale",
      "live-sale-not-available",
      "live-settle-out-of-scope",
      "reserved-fixture-requires-payment",
      "fixture-cannot-live-settle",
    ].includes(code)
  ) {
    transport = "rejected";
  } else if (process?.timedOut) transport = "timeout";
  else if (process && process.status !== 0 && !json) transport = "engine-crash";
  else if (json) transport = "ok";
  else if (result.ok === true) transport = "ok";
  else if (code === "internal-error") transport = "internal-error";
  else if (code === "engine-crash" || code === "engine-timeout") {
    transport = code === "engine-timeout" ? "timeout" : "engine-crash";
  } else if (result.ok === false && !json) transport = "rejected";
  else transport = "ok";

  const analysis = json
    ? analysisFromJson(json)
    : { status: "not-run", outcome: transport === "engine-crash" ? "crashed" : "not-run", identityVerified: null };

  let delivery;
  if (outputs.length && expected.length && outputs.length >= expected.length) {
    delivery = {
      status: "complete",
      complete: true,
      expected,
      present: outputs.map((row) => row.name),
      missing: [],
    };
  } else if (outputs.length) {
    const present = outputs.map((row) => row.name);
    delivery = {
      status: "incomplete",
      complete: false,
      expected,
      present,
      missing: expected.filter((name) => !present.includes(name)),
    };
  } else if (json && DOMAIN_ANALYSIS.includes(analysis.outcome)) {
    delivery = {
      status: "incomplete",
      complete: false,
      expected,
      present: [],
      missing: expected,
    };
  } else {
    delivery = {
      status: "not-attempted",
      complete: false,
      expected,
      present: [],
      missing: expected,
    };
  }

  return {
    source: "pr52-runPaidOffer",
    contract: result.contract || null,
    transport,
    analysis,
    delivery,
    fundingState: result.fundingState || "unfunded",
    sold: result.sold === true,
    sample: result.sample === true,
    purchaseAuthority: result.purchaseAuthority === true,
    code,
    wrapperOk: result.ok === true,
  };
}

export function isDomainAnalysis(outcome) {
  return DOMAIN_ANALYSIS.includes(outcome);
}
