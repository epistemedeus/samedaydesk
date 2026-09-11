import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const KIT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function findRepoRoot(start = process.env.SAMEDAYDESK_ROOT || KIT_ROOT) {
  let dir = start;
  for (let i = 0; i < 10; i += 1) {
    const cli = join(dir, "server/paid-useful-jobs/bin/cli.mjs");
    const discovery = join(dir, "client/public/discovery/useful-jobs.json");
    if (existsSync(cli) && existsSync(discovery)) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const err = new Error("samedaydesk repository root not found");
  err.code = "repo-root-missing";
  throw err;
}

export function defaultDocumentPaths(repoRoot) {
  return {
    mcpVersionsLatest: join(
      repoRoot,
      "tools/presence/fixtures/mcp-registry-consumer/versions-latest.json",
    ),
    mcpSearchLatest: join(
      repoRoot,
      "tools/presence/fixtures/mcp-registry-consumer/search-version-latest.json",
    ),
    mcpSearchUnfiltered: join(
      repoRoot,
      "tools/presence/fixtures/mcp-registry-consumer/search-unfiltered.json",
    ),
    presenceMcpRegistry: join(repoRoot, "fixtures/presence/listings/mcp-registry.json"),
    usefulJobsDiscovery: join(repoRoot, "client/public/discovery/useful-jobs.json"),
    usefulJobsCatalog: join(repoRoot, "client/public/for-agents/useful-jobs/catalog.json"),
    openapi: join(repoRoot, "fixtures/presence/catalog/openapi.json"),
    x402: join(repoRoot, "fixtures/presence/catalog/x402.json"),
    mpp: join(repoRoot, "fixtures/presence/listings/mpp-services.json"),
    bazaar: join(repoRoot, "fixtures/presence/listings/bazaar-merchant.json"),
    wrapperCli: join(repoRoot, "server/paid-useful-jobs/bin/cli.mjs"),
  };
}

export const WRAPPER_MODULE = "server/paid-useful-jobs/index.mjs";
