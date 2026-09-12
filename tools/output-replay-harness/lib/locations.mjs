import { mkdirSync, realpathSync, statSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname, basename, join, sep } from "node:path";
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
  if (sameOutputLocation(a, b) || a.real.startsWith(b.real + sep) || b.real.startsWith(a.real + sep)) {
    throw replayRefuse(
      "overlapping-output-dirs",
      "A and B output directories must be disjoint locations",
      { outA: a, outB: b },
    );
  }
  return { outA: a, outB: b };
}

// Resolve symlinked parents even when the final output directory is new.
export function prospectiveRealpath(dir) {
  const abs = resolve(dir);
  if (existsSync(abs)) return realpathSync(abs);
  const parent = dirname(abs);
  if (parent === abs) return abs;
  return join(prospectiveRealpath(parent), basename(abs));
}

export function assertFreshOutputDir(dir, inputPaths = []) {
  const real = prospectiveRealpath(dir);
  for (const input of inputPaths) {
    const src = prospectiveRealpath(input);
    if (src === real || src.startsWith(real + sep) || real.startsWith(src + sep)) {
      throw replayRefuse('output-collides-with-input', 'Output must be independent of input files', { dir, input });
    }
  }
  if (existsSync(real) && (!statSync(real).isDirectory() || readdirSync(real).length)) {
    throw replayRefuse('reused-output-path', 'Output directory must be new or empty', { dir });
  }
}

/** Directory the engine actually wrote, which may differ from the request. */
export function actualOutputDir(run, requestedReal) {
  const fromEngine = run?.json?.outDir;
  if (typeof fromEngine === "string" && fromEngine) return resolve(fromEngine);
  return requestedReal;
}
