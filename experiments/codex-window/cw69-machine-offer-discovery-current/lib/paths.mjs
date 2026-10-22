import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const OWNED_DIR = join(here, "..");
export const KIT_ROOT = OWNED_DIR;

export function findRepoRoot(start = process.env.SAMEDAYDESK_ROOT || OWNED_DIR) {
  let dir = start;
  for (let i = 0; i < 12; i += 1) {
    const cli = join(dir, "server/paid-useful-jobs/bin/cli.mjs");
    const catalog = join(dir, "client/public/for-agents/useful-jobs/catalog.json");
    if (existsSync(cli) && existsSync(catalog)) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const err = new Error("samedaydesk repository root not found");
  err.code = "repo-root-missing";
  throw err;
}

export function repoPaths(repoRoot = findRepoRoot()) {
  return {
    repoRoot,
    wrapperCli: join(repoRoot, "server/paid-useful-jobs/bin/cli.mjs"),
    wrapperPins: join(repoRoot, "server/paid-useful-jobs/lib/pins.mjs"),
    catalog: join(repoRoot, "client/public/for-agents/useful-jobs/catalog.json"),
    discovery: join(repoRoot, "client/public/discovery/useful-jobs.json"),
    m01Catalog: join(repoRoot, "experiments/wave5/m01/catalog.json"),
    engineRoot: join(repoRoot, "tools/lockfile-pin-delta"),
    engineBin: join(repoRoot, "tools/lockfile-pin-delta/bin/lockfile-delta.mjs"),
    wrapperArchiveMeta: join(repoRoot, "client/public/for-agents/useful-jobs/useful-jobs-1.0.0.sha256.json"),
    owned: OWNED_DIR,
    remoteEvidence: join(OWNED_DIR, "evidence/remote"),
    callerBefore: join(OWNED_DIR, "fixtures/before.json"),
    callerAfter: join(OWNED_DIR, "fixtures/after.json"),
    sourceImports: join(OWNED_DIR, "evidence/source-imports.json"),
    dependencyPins: join(OWNED_DIR, "evidence/dependency-pins.json"),
  };
}
