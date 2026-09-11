import { existsSync } from "node:fs";
import { join } from "node:path";

function engineStatusOf(body) {
  const engine = body?.engine;
  if (!engine || typeof engine !== "object") return { kind: "missing", value: null };
  if (typeof engine.status === "number") return { kind: "process", value: engine.status };
  if (typeof engine.status === "string") return { kind: "domain", value: engine.status };
  return { kind: "other", value: engine.status ?? null };
}

function deliveredNames(body, outDir) {
  const fromBody = (body?.outputs || []).map((o) => o.name).filter(Boolean);
  if (fromBody.length) return fromBody;
  return [];
}

export function advertisedPresent(advertised, outDir, body) {
  const names = advertised || [];
  const present = [];
  const missing = [];
  for (const name of names) {
    const path = join(outDir, name);
    if (existsSync(path)) present.push(name);
    else missing.push(name);
  }
  const wrapperNames = deliveredNames(body, outDir);
  return { present, missing, wrapperNames, complete: missing.length === 0 && names.length > 0 };
}

/**
 * Distinguish transport/engine failure from a valid analysis outcome.
 * A delivered refusal or no-change report is not a crash.
 */
export function classifyResult({ proc, parsed, advertised = [], outDir }) {
  const qa = { label: "owner-qa" };
  if (proc?.signal) {
    return { kind: "transport-failure", reason: `signal:${proc.signal}`, qa, complete: false };
  }
  if (proc?.error) {
    return { kind: "transport-failure", reason: proc.error.message || "spawn-error", qa, complete: false };
  }
  if (!parsed?.parseable || !parsed.body) {
    return {
      kind: "transport-failure",
      reason: parsed?.error || "non-json-stdout",
      qa,
      complete: false,
      processStatus: proc?.status ?? null,
    };
  }
  const body = parsed.body;
  const engine = engineStatusOf(body);
  const delivery = advertised.length ? advertisedPresent(advertised, outDir || body?.receipt?.outDir || "", body) : null;

  if (body.ok === false) {
    const code = body.code || "wrapper-refusal";
    if (code === "engine-refused" || engine.kind === "process") {
      return {
        kind: "engine-failure",
        code,
        error: body.error || null,
        fundingState: body.fundingState || null,
        sold: body.sold === true,
        qa,
        complete: false,
        engine,
      };
    }
    return {
      kind: "wrapper-refusal",
      code,
      error: body.error || null,
      fundingState: body.fundingState || "rejected",
      sold: body.sold === true,
      sample: body.sample === true,
      qa,
      complete: false,
      validAnalysis: false,
    };
  }

  const complete = delivery ? delivery.complete : (body.outputs || []).length > 0;
  if (!complete) {
    return {
      kind: "incomplete-delivery",
      code: "missing-advertised-outputs",
      missing: delivery?.missing || [],
      sold: body.sold === true,
      qa,
      complete: false,
      engine,
      delivery,
    };
  }

  if (engine.kind === "domain" && engine.value === "refused") {
    return {
      kind: "analysis-refusal",
      validAnalysis: true,
      sold: body.sold === true,
      fundingState: body.fundingState || null,
      sample: body.sample === true,
      qa,
      complete: true,
      engine,
      delivery,
    };
  }
  if (engine.kind === "domain" && engine.value === "informational") {
    return {
      kind: "analysis-no-change",
      validAnalysis: true,
      sold: body.sold === true,
      fundingState: body.fundingState || null,
      sample: body.sample === true,
      qa,
      complete: true,
      engine,
      delivery,
    };
  }
  if (engine.kind === "domain" && engine.value === "actionable") {
    return {
      kind: "analysis-change",
      validAnalysis: true,
      sold: body.sold === true,
      fundingState: body.fundingState || null,
      sample: body.sample === true,
      qa,
      complete: true,
      engine,
      delivery,
    };
  }
  return {
    kind: "analysis-other",
    engine,
    sold: body.sold === true,
    qa,
    complete,
    delivery,
  };
}
