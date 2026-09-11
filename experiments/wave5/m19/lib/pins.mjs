import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
export const OWNED_DIR = join(here, "..");
export const REPO_ROOT = join(OWNED_DIR, "../../..");
export const SCHEMA = "samedaydesk.wave5.m19.distribution.v1";

export const PIN = JSON.parse(readFileSync(join(OWNED_DIR, "PIN.json"), "utf8"));

export const SDS52 = PIN.tested.SDS52.sha;
export const PRESENCE_LIB = join(REPO_ROOT, "tools/presence/lib.mjs");
export const REGISTRY_CONSUMER = join(REPO_ROOT, "tools/presence/registry-consumer.mjs");
export const WRAPPER_CLI = join(REPO_ROOT, "server/paid-useful-jobs/bin/cli.mjs");
export const WRAPPER_INDEX = join(REPO_ROOT, "server/paid-useful-jobs/index.mjs");
export const CATALOG_PATH = join(REPO_ROOT, "client/public/for-agents/useful-jobs/catalog.json");
export const DISCOVERY_PATH = join(REPO_ROOT, "client/public/discovery/useful-jobs.json");
export const CALLER_BEFORE = join(
  REPO_ROOT,
  "server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/before.json",
);
export const CALLER_AFTER = join(
  REPO_ROOT,
  "server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/after.json",
);
export const RESERVED_PAYMENT = join(
  REPO_ROOT,
  "server/paid-useful-jobs/fixtures/payment/reserved-fixture.json",
);

export const SELECTED_SURFACE = "mcp-registry";
export const SELECTED_CONTRIBUTION_ID = "mcp-registry-version-only";
export const PRESENCE_SNAPSHOT = "presence-fixture-2026-09-03";
export const CONSUMER_SNAPSHOT = "mcp-registry-consumer-2026-09-09";

export function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function sha256Json(value) {
  return sha256Bytes(Buffer.from(JSON.stringify(value), "utf8"));
}

export function sha256File(path) {
  return sha256Bytes(readFileSync(path));
}

export function requiredFiles() {
  return {
    presence: PRESENCE_LIB,
    registryConsumer: REGISTRY_CONSUMER,
    wrapperCli: WRAPPER_CLI,
    wrapperIndex: WRAPPER_INDEX,
    catalog: CATALOG_PATH,
    discovery: DISCOVERY_PATH,
    callerBefore: CALLER_BEFORE,
    callerAfter: CALLER_AFTER,
    reservedPayment: RESERVED_PAYMENT,
  };
}

export function missingDependencies() {
  return Object.entries(requiredFiles())
    .filter(([, path]) => !existsSync(path))
    .map(([name, path]) => ({ name, path }));
}
