import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  M01_CATALOG_CLI,
  M01_COMPOSITION_SHA,
  M01_INDEX,
  M01_RUN_JOB,
  M01_WORKTREE,
} from "./paths.mjs";

export const COMPOSITION_SHA = M01_COMPOSITION_SHA;
export const COMPOSITION_WORKTREE = M01_WORKTREE;

export const M01_ENGINE_PINS = Object.freeze({
  "lockfile-pin-delta": "fba9d14872bc4c04214e527b9edfb30c2123c9e7",
  "json-schema-webhook-drift": "27482b712a7221e5079d70df85c5dd5608dc70eb",
  "route-table-diff": "886c81d824e0a24e2faa5b821b1cd0ca46ae0859",
  "page-change-offline-job": "fec7bc04ac4419f8e7ce40f2613314e6953af6bc",
});

export function observedCompositionSha(worktree = M01_WORKTREE) {
  try {
    const r = spawnSync("git", ["-C", worktree, "rev-parse", "HEAD"], {
      encoding: "utf8",
      timeout: 10_000,
    });
    if (r.status === 0) return r.stdout.trim();
    return null;
  } catch {
    return null;
  }
}

/**
 * Map an H04 example onto the M01 four-engine catalog.
 * SDS52 api-upgrade-brief is not one of the four; recorded as mapping, not rewritten.
 */
export function mapExampleToM01(example) {
  const engines = example.engines || [];
  const family = example.family;
  if (family === "lockfile" || family === "lockfile-public" || engines.includes("w4-lockfile-pin-delta")) {
    return {
      m01EngineId: "lockfile-pin-delta",
      mapping: "ok",
      note: null,
    };
  }
  if (family === "schema-webhook" || engines.includes("w4-json-schema-webhook-drift")) {
    return {
      m01EngineId: "json-schema-webhook-drift",
      mapping: "ok",
      note: null,
    };
  }
  if (family === "page-facts" || engines.includes("w4-page-change-offline-job")) {
    return {
      m01EngineId: "page-change-offline-job",
      mapping: "ok",
      note: null,
    };
  }
  if (
    engines.includes("sds52-api-upgrade-brief") ||
    engines.includes("sds52-paid-useful-jobs") ||
    String(example.inputs?.before || "").endsWith(".yaml")
  ) {
    return {
      m01EngineId: null,
      mapping: "not-in-m01-four",
      sds52Job: "api-upgrade-brief",
      note: "OpenAPI api-upgrade-brief stays SDS52. M01 json-schema-webhook-drift refuses OpenAPI (not-this-job-openapi).",
    };
  }
  if (family === "api-routes" || engines.includes("w4-route-table-diff")) {
    return {
      m01EngineId: "route-table-diff",
      mapping: "ok",
      note: null,
    };
  }
  return {
    m01EngineId: null,
    mapping: "unknown-family",
    note: `no M01 engine for family=${family} engines=${JSON.stringify(engines)}`,
  };
}

export function m01RunJobPath(worktree = M01_WORKTREE) {
  return join(worktree, M01_RUN_JOB);
}

export function m01CatalogCliPath(worktree = M01_WORKTREE) {
  return join(worktree, M01_CATALOG_CLI);
}

export function m01IndexUrl(worktree = M01_WORKTREE) {
  return `file://${join(worktree, M01_INDEX)}`;
}

export function loadM01CatalogJson(worktree = M01_WORKTREE) {
  const path = join(worktree, "experiments/wave5/m01/catalog.json");
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}
