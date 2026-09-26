/**
 * Resolve Cap01 envelope + Cap04 cost dry-run + Cap05 failure fallback APIs.
 *
 * Preference order (portable; no machine-specific absolute paths):
 *   1) in-repo sibling Cap packages under ../01|04|05
 *   2) repo-relative experiments/scale-r2-20260910/capabilities/{01,04,05}
 *   3) thin schema-compatible stubs for Cap01/04 (always available offline)
 *
 * Cap05 is optional: when missing, fallback stage stays not_run.
 * Documents dependsOn Cap01/Cap04; never re-implements Cap02/03/06.
 */
import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  stubBuildTaskRequirementsEnvelope,
  stubBuildCostDryRunComparison,
} from "./stubs/cap01_cap04.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, "..");
const repoRoot = join(packageRoot, "../../../../../");

const CAP01_REL = "experiments/scale-r2-20260910/capabilities/01/src/index.mjs";
const CAP04_REL = "experiments/scale-r2-20260910/capabilities/04/src/index.mjs";
const CAP05_REL = "experiments/scale-r2-20260910/capabilities/05/src/index.mjs";

const CAP01_CANDIDATES = [
  join(packageRoot, "../01/src/index.mjs"),
  join(repoRoot, CAP01_REL),
];

const CAP04_CANDIDATES = [
  join(packageRoot, "../04/src/index.mjs"),
  join(repoRoot, CAP04_REL),
];

const CAP05_CANDIDATES = [
  join(packageRoot, "../05/src/index.mjs"),
  join(repoRoot, CAP05_REL),
];

async function pathExists(p) {
  try {
    await access(p, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function tryImport(candidates) {
  for (const candidate of candidates) {
    if (!(await pathExists(candidate))) continue;
    try {
      const mod = await import(pathToFileURL(candidate).href);
      return { mod, path: candidate };
    } catch {
      // try next
    }
  }
  return null;
}

/**
 * Load Cap01/Cap04 (real or stub) and Cap05 (real or unavailable).
 * Cached per process.
 */
let _cache = null;

export async function resolveDependencies() {
  if (_cache) return _cache;

  const cap01 = await tryImport(CAP01_CANDIDATES);
  const cap04 = await tryImport(CAP04_CANDIDATES);
  const cap05 = await tryImport(CAP05_CANDIDATES);

  const buildTaskRequirementsEnvelope = cap01?.mod?.buildTaskRequirementsEnvelope
    ? cap01.mod.buildTaskRequirementsEnvelope.bind(cap01.mod)
    : stubBuildTaskRequirementsEnvelope;

  const buildCostDryRunComparison = cap04?.mod?.buildCostDryRunComparison
    ? cap04.mod.buildCostDryRunComparison.bind(cap04.mod)
    : stubBuildCostDryRunComparison;

  const buildFailureFallbackPlan = cap05?.mod?.buildFailureFallbackPlan
    ? cap05.mod.buildFailureFallbackPlan.bind(cap05.mod)
    : null;

  _cache = {
    cap01: {
      available: Boolean(cap01?.mod?.buildTaskRequirementsEnvelope),
      path: cap01?.path ?? null,
      implementation: cap01?.mod?.buildTaskRequirementsEnvelope ? "cap01" : "stub",
      buildTaskRequirementsEnvelope,
    },
    cap04: {
      available: Boolean(cap04?.mod?.buildCostDryRunComparison),
      path: cap04?.path ?? null,
      implementation: cap04?.mod?.buildCostDryRunComparison ? "cap04" : "stub",
      buildCostDryRunComparison,
    },
    cap05: {
      available: Boolean(buildFailureFallbackPlan),
      path: cap05?.path ?? null,
      implementation: buildFailureFallbackPlan ? "cap05" : "stub",
      buildFailureFallbackPlan,
    },
  };
  return _cache;
}

/** Test helper: clear cached deps. */
export function _resetDepsCacheForTests() {
  _cache = null;
}
