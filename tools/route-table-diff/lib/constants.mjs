import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const MODULE_ROOT = join(here, "..");
export const FIXTURES_DIR = join(MODULE_ROOT, "fixtures");
export const PUBLIC_SHELLS_SNAPSHOT = join(FIXTURES_DIR, "public-shells-snapshot.json");
export const JOURNEY_BEFORE = join(FIXTURES_DIR, "journey", "before.json");
export const JOURNEY_AFTER = join(FIXTURES_DIR, "journey", "after.json");
export const SAMPLE_BEFORE = join(FIXTURES_DIR, "SAMPLE", "before.json");
export const SAMPLE_AFTER = join(FIXTURES_DIR, "SAMPLE", "after.json");
export const COMPARISON_PERMUTED = join(FIXTURES_DIR, "comparison", "permuted.json");
export const COMPARISON_REMOVED = join(FIXTURES_DIR, "comparison", "removed-privacy.json");
export const COMPARISON_COLLISION_PATH = join(FIXTURES_DIR, "comparison", "collision-duplicate-path.json");
export const COMPARISON_SLASH_ALIAS = join(FIXTURES_DIR, "comparison", "slash-alias.json");
export const COMPARISON_COLLISION_ENCODED = join(FIXTURES_DIR, "comparison", "collision-encoded-path.json");
export const COMPARISON_COLLISION_CANONICAL = join(FIXTURES_DIR, "comparison", "collision-canonical.json");

export const SCHEMA_TABLE = "samedaydesk.route-table.v1";
export const SCHEMA_DIFF = "samedaydesk.route-diff.v1";
export const SCHEMA_DIGEST = "samedaydesk.route-table.digest.v2";

/** Pinned homepage identity from server/lib/spa-route-shells.js at startingRef. Homepage is not a crawler shell. */
export const SITE_ORIGIN = "https://samedaydesk.com";
export const HOME_PATH = "/";
export const HOME_CANONICAL = `${SITE_ORIGIN}/`;
export const HOME_TITLE = "SameDayDesk: agent commerce, built and shipped";

export const SOURCE_PIN = Object.freeze({
  repo: "epistemedeus/samedaydesk",
  ref: "main",
  sha: "5b97d1b02e786acd1895cfa1508087ae3f7a1545",
  spaRouteShells: "server/lib/spa-route-shells.js",
  spaRouteShellsTests: "server/scripts/test-spa-route-shells.js",
  usefulJobsCatalog: "client/public/for-agents/useful-jobs/catalog.json",
  machineEntry: "client/src/data/machineEntry.mjs",
});

export const PUBLIC_SHELL_PATHS = Object.freeze([
  "/for-agents",
  "/for-agents/record-repeat",
  "/for-agents/distribution-repair",
  "/for-agents/consumer-repeat",
  "/for-agents/useful-jobs",
  "/terms",
  "/privacy",
]);

export const CONTENT_HASH_RE = /^sha256:[a-f0-9]{64}$/;

export const LATER_BINDINGS = Object.freeze({
  publicShellsLiveExport:
    "Unbound. Inject a reader of PUBLIC_SHELLS / SPA_ROUTE_SHELLS. Do not edit spa-route-shells.js.",
  hashTermsVersion:
    "I01 / Neo PR54 owns hashTermsVersion (sha256: + 64 hex). This job hashes route tables only and does not import the earned-work kernel.",
  listingRepairPacket:
    "listing-repair-packet diagnoses listing/route snapshots. Consume it later through an injected adapter. This job diffs caller route catalogs only.",
  spaRouteShellsWriter: "Never bind. This job does not write route shells or homepages.",
  integrationOwner:
    "W5-M01 owns wrapper/catalog wiring. This module publishes the comparison contract only. Do not claim a future sibling's behavior.",
});
