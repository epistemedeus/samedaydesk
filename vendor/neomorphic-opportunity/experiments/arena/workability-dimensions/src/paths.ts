import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const PACK_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function repoRoot(): string {
  return join(PACK_ROOT, "../../..");
}

export function bountyIntelligenceFixturesDir(): string | null {
  const dir = join(repoRoot(), "packs/bounty-intelligence/fixtures/s282");
  return existsSync(dir) ? dir : null;
}

export function ownFixturesDir(): string {
  return join(PACK_ROOT, "fixtures/s282");
}

/** Prefer F03 cards when that pack exists; otherwise use this arm's copies. */
export function s282FixturesDir(): string {
  return bountyIntelligenceFixturesDir() || ownFixturesDir();
}

export function externalJobIntakeRoot(): string | null {
  const dir = join(repoRoot(), "packs/external-job-intake");
  return existsSync(join(dir, "README.md")) ? dir : null;
}

export function capabilityPreflightRoot(): string | null {
  const dir = join(repoRoot(), "packs/capability-preflight");
  return existsSync(join(dir, "package.json")) ? dir : null;
}

export function outsideOperatorFirstJobRoot(): string | null {
  const dir = join(repoRoot(), "packs/outside-operator-first-job");
  return existsSync(join(dir, "README.md")) ? dir : null;
}

export function resolveCardPath(file: string): string {
  if (file.startsWith("/") || file.startsWith(".")) {
    return file;
  }
  const fromPackRoot = join(PACK_ROOT, file);
  if (existsSync(fromPackRoot)) return fromPackRoot;
  const own = join(ownFixturesDir(), file);
  if (existsSync(own)) return own;
  const basename = file.split("/").pop() || file;
  const ownBase = join(ownFixturesDir(), basename);
  if (existsSync(ownBase)) return ownBase;
  const f03 = bountyIntelligenceFixturesDir();
  if (f03) {
    const there = join(f03, file);
    if (existsSync(there)) return there;
  }
  return join(s282FixturesDir(), file);
}
