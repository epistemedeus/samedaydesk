import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

const PRE_ENGINE_CODES = new Set([
  "missing-job",
  "unknown-job",
  "missing-required-inputs",
  "input-oversize",
  "input-malformed",
  "input-missing-file",
  "input-not-file",
  "input-root-not-directory",
  "sample-not-a-sale",
  "live-sale-not-available",
  "live-settle-out-of-scope",
  "fixture-cannot-live-settle",
  "reserved-fixture-requires-payment",
]);

function presentNames(result, expected) {
  const fromOutputs = new Set((result?.outputs || []).map((o) => o.name));
  const outDir = result?.receipt?.outDir || result?.outDir || null;
  const present = [];
  for (const name of expected) {
    if (fromOutputs.has(name)) {
      present.push(name);
      continue;
    }
    if (outDir && existsSync(join(outDir, name)) && statSync(join(outDir, name)).isFile()) {
      present.push(name);
    }
  }
  return present;
}

export function classifyResult(result, expectedOutputs = []) {
  if (result && result.transport && result.analysis && result.delivery) {
    return {
      transport: result.transport,
      analysis: result.analysis,
      delivery: result.delivery,
      source: result.contract || "d01-result-fields",
    };
  }

  const expected = [...expectedOutputs];
  if (!result || typeof result !== "object") {
    return {
      transport: "internal-error",
      analysis: { status: "not-run", outcome: "not-run" },
      delivery: { status: "not-attempted", complete: false, expected, present: [], missing: expected },
      source: "sds52-result-fields",
    };
  }

  if (PRE_ENGINE_CODES.has(result.code)) {
    return {
      transport: "rejected",
      analysis: { status: "not-run", outcome: "not-run", code: result.code },
      delivery: { status: "not-attempted", complete: false, expected, present: [], missing: expected },
      source: "sds52-result-fields",
    };
  }

  if (result.code === "internal-error") {
    return {
      transport: "internal-error",
      analysis: { status: "not-run", outcome: "not-run" },
      delivery: { status: "not-attempted", complete: false, expected, present: [], missing: expected },
      source: "sds52-result-fields",
    };
  }

  const engine = result.engine && typeof result.engine === "object" ? result.engine : null;
  if (!engine) {
    return {
      transport: result.ok === false ? "rejected" : "internal-error",
      analysis: { status: "not-run", outcome: "not-run", code: result.code || null },
      delivery: { status: "not-attempted", complete: false, expected, present: [], missing: expected },
      source: "sds52-result-fields",
    };
  }

  const present = presentNames(result, expected);
  const missing = expected.filter((n) => !present.includes(n));
  const delivery = {
    status: missing.length === 0 ? "complete" : present.length === 0 ? "not-attempted" : "incomplete",
    complete: missing.length === 0,
    expected,
    present,
    missing,
  };

  let analysis;
  if (engine.ok === false || engine.refused === true) {
    analysis = { status: engine.status || "refused", outcome: "refused" };
  } else if (engine.status === "informational" || engine.status === "partial") {
    analysis = { status: engine.status, outcome: engine.status };
  } else {
    analysis = { status: engine.status || "completed", outcome: "completed" };
  }

  return {
    transport: "ok",
    analysis,
    delivery,
    source: "sds52-result-fields",
  };
}
