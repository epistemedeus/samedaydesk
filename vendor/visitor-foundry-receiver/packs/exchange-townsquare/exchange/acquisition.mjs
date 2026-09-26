/**
 * Local package acquisition preflight for R2 Outcome Exchange experiments.
 * Same spirit as first-job acquisition: verify before continue — no network,
 * no republish. Confirms modules 01–08 entrypoints exist on disk.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const ACQUISITION_SCHEMA = "neomorphic.r2.exchange.package_acquisition.v1";

export const MODULE_ENTRYPOINTS = Object.freeze([
  ["01", "src/index.mjs"],
  ["02", "src/index.mjs"],
  ["03", "src/index.mjs"],
  ["04", "src/index.mjs"],
  ["05", "src/index.mjs"],
  ["06", "src/index.mjs"],
  ["07", "src/index.mjs"],
  ["08", "src/index.mjs"],
  ["08", "src/gate.mjs"],
  ["08", "src/cli.mjs"],
  ["08", "src/correction-journey.mjs"],
]);

export const REVIEW_PIN = Object.freeze({
  sha: "17236cda20560f2a850ff2b354a720ba9f7025d6",
  branch: "codex/r2-exchange-08-20260910",
  note: "S151 6Pro review pin — read-only; do not rewrite for S155 work.",
});

function buildResult(root, missing, present) {
  const ok = missing.length === 0;
  return {
    schema: ACQUISITION_SCHEMA,
    ok,
    root,
    presentCount: present.length,
    missing,
    present,
    reviewPin: REVIEW_PIN,
    continueJourney: ok,
    decision: ok ? "pass" : "stop",
    reason: ok ? "local_modules_present" : "missing_module_entrypoints",
    consumerHint: ok
      ? "Package acquired locally. Run: node 08/src/cli.mjs demo | demo-gate | demo-correct"
      : "Missing entrypoints — sync or checkout exchange modules before journey.",
  };
}

export function preflightExchangePackageSync({ root = __dirname } = {}) {
  const missing = [];
  const present = [];
  for (const [mod, rel] of MODULE_ENTRYPOINTS) {
    const path = join(root, mod, rel);
    if (existsSync(path)) present.push(`${mod}/${rel}`);
    else missing.push(`${mod}/${rel}`);
  }
  return buildResult(root, missing, present);
}

export async function preflightExchangePackage(opts) {
  return preflightExchangePackageSync(opts);
}
