import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { F08_PIN_SHA, F08_PIN_PR, I01_NEO_SHA, REPO_ROOT, KNOWN_RUNNERS, FALLBACK_RUNNERS } from "./pins.mjs";

export { KNOWN_RUNNERS, FALLBACK_RUNNERS };

export function isFallbackRunner(runner) {
  return FALLBACK_RUNNERS.includes(runner);
}

export function isKnownRunner(runner) {
  return KNOWN_RUNNERS.includes(runner);
}

export const DEFAULT_PIN_WORKTREE = "/tmp/sds-pr52-aeef964";

export function resolveF08Root(explicit) {
  if (explicit) return explicit;
  if (process.env.F08_PIN_ROOT) return process.env.F08_PIN_ROOT;
  const sibling = join(REPO_ROOT, "server/paid-useful-jobs/index.mjs");
  if (existsSync(sibling)) return REPO_ROOT;
  const worktrees = [process.env.F08_PIN_WORKTREE, DEFAULT_PIN_WORKTREE].filter(Boolean);
  for (const root of worktrees) {
    if (existsSync(join(root, "server/paid-useful-jobs/index.mjs"))) return root;
  }
  return null;
}

export function f08IndexPath(root) {
  return join(root, "server/paid-useful-jobs/index.mjs");
}

export async function loadF08Module(root = resolveF08Root()) {
  if (!root) return null;
  const index = f08IndexPath(root);
  if (!existsSync(index)) return null;
  return import(pathToFileURL(index).href);
}

export function mapF08ResultToItem(engineId, result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return {
      engineId,
      outcome: "rejected",
      fundingState: "rejected",
      sold: false,
      code: "f08-unreadable",
      runner: "paid-useful-jobs",
    };
  }
  return {
    engineId,
    outcome: result.ok === true ? "completed" : "rejected",
    fundingState: result.fundingState || "rejected",
    sold: false,
    code: result.code || null,
    error: result.error || null,
    sample: Boolean(result.sample),
    sampleReasons: result.sampleReasons || [],
    outputs: result.outputs || [],
    runner: "paid-useful-jobs",
    f08Ok: result.ok === true,
  };
}

export const LATER_BINDINGS = Object.freeze({
  runner: {
    status: "consumed-pin",
    pr: F08_PIN_PR,
    pin: F08_PIN_SHA,
    env: "F08_PIN_ROOT",
    consume: "server/paid-useful-jobs runPaidOffer + classifyFunding; not copied into this package",
    remaining: "W5-D01 may amend the wrapper after this pin; this ledger reports the SHA it actually imported",
  },
  i01: {
    status: "hasher-pinned",
    pr: "neomorphic-io#54",
    pin: I01_NEO_SHA,
    consume: "hashTermsVersion; integer termsVersion rejected; unlike F08 receipt hashes are not forced equal",
  },
});
