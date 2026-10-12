import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyCheck } from "./observation.mjs";
import {
  F08_RECEIPT_PATH,
  F08_SHA,
  REPO_ROOT,
  SDS52_SHA,
  WRAPPER_RECEIPT_SCHEMA,
} from "./pins.mjs";

export const F08_WORKTREE_DEFAULT = "/tmp/ro-worktrees/f08-bae3e7cd";
export const SDS52_WORKTREE_DEFAULT = "/tmp/ro-worktrees/sds52-aeef964f";

export function verifyPinWorktree({
  id,
  sha,
  dest,
  repoRoot = REPO_ROOT,
  relativeFile,
  schemaNeedle,
}) {
  const file = join(dest, relativeFile);
  if (!existsSync(file)) {
    const add = spawnSync("git", ["-C", repoRoot, "worktree", "add", "--detach", dest, sha], {
      encoding: "utf8",
    });
    if (!existsSync(file)) {
      return {
        ...classifyCheck({
          id,
          ran: false,
          detail: `worktree missing for ${sha}: ${(add.stderr || add.stdout || "").trim()}`,
        }),
        sha,
        got: null,
        file: relativeFile,
      };
    }
  }
  const head = spawnSync("git", ["-C", dest, "rev-parse", "HEAD"], { encoding: "utf8" });
  const got = (head.stdout || "").trim();
  const src = existsSync(file) ? readFileSync(file, "utf8") : "";
  const matched = got === sha && (!schemaNeedle || src.includes(schemaNeedle));
  return {
    ...classifyCheck({
      id,
      ran: true,
      observed: true,
      matched,
      detail: matched ? `verified ${sha}` : `mismatch head=${got} sha=${sha}`,
    }),
    sha,
    got,
    file: relativeFile,
  };
}

export function defaultPinChecks() {
  return [
    classifyCheck({
      id: "f08-pin-worktree",
      ran: false,
      detail: "unrun until --verify-pins; not a passing skip",
    }),
    classifyCheck({
      id: "sds52-pin-worktree",
      ran: false,
      detail: "unrun until --verify-pins; not a passing skip",
    }),
  ];
}

export function runPinChecks({
  repoRoot = REPO_ROOT,
  f08Dest = process.env.F08_READONLY_WORKTREE || F08_WORKTREE_DEFAULT,
  sds52Dest = process.env.SDS52_READONLY_WORKTREE || SDS52_WORKTREE_DEFAULT,
} = {}) {
  return [
    verifyPinWorktree({
      id: "f08-pin-worktree",
      sha: F08_SHA,
      dest: f08Dest,
      repoRoot,
      relativeFile: F08_RECEIPT_PATH,
      schemaNeedle: WRAPPER_RECEIPT_SCHEMA,
    }),
    verifyPinWorktree({
      id: "sds52-pin-worktree",
      sha: SDS52_SHA,
      dest: sds52Dest,
      repoRoot,
      relativeFile: F08_RECEIPT_PATH,
      schemaNeedle: WRAPPER_RECEIPT_SCHEMA,
    }),
  ];
}

export function buildHonestyChecks(evidence = [], options = {}) {
  const extractRows = evidence.filter((row) => row.sourceKind === "extract-unpaid");
  const observed402 = extractRows.some(
    (row) => row.observationStatus === "observed" && row.observedHttpStatus === 402,
  );
  const expected402 = extractRows.some(
    (row) => row.observationStatus === "expected" && row.expectedStatus === 402,
  );
  const extractCheck = observed402
    ? classifyCheck({
        id: "extract-http-402",
        ran: true,
        observed: true,
        matched: true,
        detail: "captured HTTP 402",
      })
    : expected402
      ? classifyCheck({
          id: "extract-http-402",
          ran: true,
          observed: false,
          matched: true,
          detail: "catalog/fixture expected 402 only",
        })
      : classifyCheck({
          id: "extract-http-402",
          ran: false,
          detail: "no extract-unpaid 402 item in this pack",
        });

  const liveObserved = extractRows.some(
    (row) => row.origin?.class === "external" && row.observationStatus === "observed",
  );
  const live = classifyCheck({
    id: "live-extract-http",
    ran: liveObserved,
    observed: liveObserved,
    matched: liveObserved,
    detail:
      "Production extract GET is unrun unless origin.class is external with captured status. Local-runtime 402 is not live extract.",
  });

  const postgres = classifyCheck({
    id: "postgres",
    ran: false,
    detail: "not used by this packer; absence is incomplete coverage, not a skipped passing gate",
  });

  const pinChecks = options.pinChecks || defaultPinChecks();
  return [extractCheck, live, postgres, ...pinChecks];
}
