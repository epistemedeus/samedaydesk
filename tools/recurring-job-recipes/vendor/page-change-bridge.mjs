import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { CONTRACTS } from "./merchant-contracts.mjs";
import { requireMerchantRoot } from "./resolve-merchant-root.mjs";

let compareModulePromise = null;

async function loadCompare() {
  if (!compareModulePromise) {
    const root = requireMerchantRoot();
    compareModulePromise = import(
      pathToFileURL(join(root, "examples/customer-x402/src/page-change/compare.mjs")).href
    );
  }
  return compareModulePromise;
}

export async function comparePageChangeArtifacts({ beforePath, afterPath, fields, clock, limits } = {}) {
  const { comparePageBatches } = await loadCompare();
  const report = await comparePageBatches(beforePath, afterPath, {
    fields,
    clock,
    limits,
  });
  return {
    contract: CONTRACTS.C31.id,
    schema: report.schema,
    verdict: report.verdict,
    report,
  };
}

export function mapPageChangeVerdictToRecipeOutcome(verdict) {
  if (verdict === "unchanged" || verdict === "reordered") return "unchanged";
  if (verdict === "changed") return "changed";
  if (verdict === "incomplete" || verdict === "partial") return "partial";
  if (verdict === "incomparable" || verdict === "ambiguous") return "error";
  return "error";
}
