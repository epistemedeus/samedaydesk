import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { CorpusFixture } from "./corpus-types.ts";
import { PACK_ROOT, SDS_VERIFIED_FEED } from "./paths.ts";

export const CORPUS_NOTES_DIR = join(PACK_ROOT, "fixtures/corpus");
export const F18_LIVE_ROUTE_COUNT = 23;
export const F18_OLDER_ROUTE_COUNT = 22;
export const PRIOR_H4_SESSION_ID = "1434eeed-5e5c-48d1-b2d1-1ea29c966400";
export const PARENT_H4R_SESSION_ID = "512803b8-c0dc-4a9d-a58f-1ab2d07cc0a3";

type VerifiedFeed = {
  schemaVersion?: unknown;
  generatedAt?: unknown;
  routes?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function noteFields(
  rest: Omit<CorpusFixture, "saleState" | "provenance" | "authorized">,
): CorpusFixture {
  return {
    ...rest,
    saleState: "not_a_sale",
    provenance: "fixture",
    authorized: false,
  };
}

export function readVerifiedFeed(feedPath = SDS_VERIFIED_FEED): {
  schemaVersion: string | null;
  generatedAt: string | null;
  routes: Array<{ method: string; route: string }>;
} {
  const parsed = JSON.parse(readFileSync(feedPath, "utf8")) as VerifiedFeed;
  if (!Array.isArray(parsed.routes)) {
    throw new Error(`verified feed missing routes array: ${feedPath}`);
  }
  const routes = parsed.routes.map((row, index) => {
    if (!isRecord(row)) {
      throw new Error(`verified feed route ${index} is not an object`);
    }
    return {
      method: typeof row.method === "string" ? row.method : "",
      route: typeof row.route === "string" ? row.route : "",
    };
  });
  return {
    schemaVersion: typeof parsed.schemaVersion === "string" ? parsed.schemaVersion : null,
    generatedAt: typeof parsed.generatedAt === "string" ? parsed.generatedAt : null,
    routes,
  };
}

/** SDS `client/public/x402/verified.json` `routes.length`. Read-only. */
export function readLocalRouteCount(feedPath = SDS_VERIFIED_FEED): number {
  return readVerifiedFeed(feedPath).routes.length;
}

export function loadCorpusNoteFixture(id: string): CorpusFixture {
  const filePath = join(CORPUS_NOTES_DIR, `${id}.json`);
  return JSON.parse(readFileSync(filePath, "utf8")) as CorpusFixture;
}

export function noteF18Routes(feedPath = SDS_VERIFIED_FEED): CorpusFixture {
  const feed = readVerifiedFeed(feedPath);
  return noteFields({
    id: "F18-routes",
    title: "Live routeCount 23 vs older 22 vs local verified.json 20",
    disposition: "noted",
    inSdsScope: true,
    kind: "note",
    evaluator: "corpus-notes",
    briefPath: null,
    notes:
      "F18 live journeys reported routeCount 23 versus an older count of 22. This tree's committed client/public/x402/verified.json has routes.length 20. Observation only; verified.json is not changed.",
    facts: {
      localRouteCount: feed.routes.length,
      f18LiveRouteCount: F18_LIVE_ROUTE_COUNT,
      olderRouteCount: F18_OLDER_ROUTE_COUNT,
      feedPath: "client/public/x402/verified.json",
      schemaVersion: feed.schemaVersion,
      generatedAt: feed.generatedAt,
      localRoutes: feed.routes.map((row) => `${row.method} ${row.route}`),
    },
  });
}

export function noteMH4Api(): CorpusFixture {
  return noteFields({
    id: "M-H4-api",
    title: "Short API result vs delivered branch — collector must keep a non-truncated Heavy receipt",
    disposition: "noted",
    inSdsScope: false,
    kind: "note",
    evaluator: "corpus-notes",
    briefPath: null,
    notes:
      "Short API result versus delivered branch is a collector/receipt problem, not an SDS product patch. This pack child cannot write parent RECEIPT.md. The deliverable is the parent RECEIPT.md H4R section plus the non-truncated final JSON stdout. Prior H4 session 1434eeed-5e5c-48d1-b2d1-1ea29c966400. Parent H4R session 512803b8-c0dc-4a9d-a58f-1ab2d07cc0a3.",
    facts: {
      priorH4SessionId: PRIOR_H4_SESSION_ID,
      parentSessionId: PARENT_H4R_SESSION_ID,
      childWritesParentReceipt: false,
      deliverable: [
        "parent RECEIPT.md H4R section",
        "parent final JSON stdout (non-truncated)",
      ],
    },
  });
}

export function noteF16Meter(): CorpusFixture {
  return noteFields({
    id: "M-F16-meter",
    title: "F16 meter vendored; Pilot not attached to SDS",
    disposition: "noted",
    inSdsScope: false,
    kind: "note",
    evaluator: "corpus-notes",
    briefPath: "briefs/M-F16-meter.md",
    notes:
      "F16 meter is a vendored Pilot residual. Pilot is not attached to SDS, and SDS cannot push Pilot. Repo search found no F16 meter product on this tree. Observation/brief only; no meter implementation and no production change in this pack.",
    facts: {
      vendoredMeter: true,
      pilotAttached: false,
      sdsCanPushPilot: false,
      meterImplemented: false,
      productionChangeInThisPack: false,
      searchHits: [
        "experiments/cursor-wave-20260911/h4-precise-repairs/PROMPT-H4R.md",
        "experiments/cursor-wave-20260911/h4-precise-repairs/src/corpus-types.ts",
      ],
    },
  });
}
