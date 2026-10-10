import { mkdirSync, realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { replayRefuse } from "./args.mjs";

/**
 * Resolve a caller output directory to its real location.
 * Caller A/B aliases (same path, trailing slash, symlink, bind mount)
 * are the same location.
 */
export function resolveOutputDir(dir) {
  if (dir == null || dir === "") {
    throw replayRefuse("missing-out-dirs", "--out-a and --out-b are required");
  }
  const resolved = resolve(String(dir));
  mkdirSync(resolved, { recursive: true });
  const real = realpathSync(resolved);
  const st = statSync(real);
  return {
    requested: String(dir),
    resolved,
    real,
    dev: st.dev,
    ino: st.ino,
  };
}

export function sameOutputLocation(a, b) {
  return a.real === b.real || (a.dev === b.dev && a.ino === b.ino);
}

/**
 * Public contract: A and B output directories must be disjoint.
 */
export function assertDisjointOutputDirs(outA, outB) {
  const a = resolveOutputDir(outA);
  const b = resolveOutputDir(outB);
  if (sameOutputLocation(a, b)) {
    throw replayRefuse(
      "overlapping-output-dirs",
      "A and B output directories must be disjoint locations",
      { outA: a, outB: b },
    );
  }
  return { outA: a, outB: b };
}

/** Directory the engine actually wrote, which may differ from the request. */
export function actualOutputDir(run, requestedReal) {
  const fromEngine = run?.json?.outDir;
  if (typeof fromEngine === "string" && fromEngine) return resolve(fromEngine);
  return requestedReal;
}
