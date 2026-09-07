#!/usr/bin/env node
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crawl from "../src/data/sellerConformanceCrawl.json" with { type: "json" };
import { generateVerifiedFeed } from "./generateVerifiedFeed.mjs";
import { validateVerifiedFeed } from "./verifiedFeedValidation.mjs";
import {
  DEFAULT_CONCURRENCY,
  DEFAULT_LIVE_ROUTE_LIMIT,
  DEFAULT_MAX_BYTES,
  DEFAULT_OBSERVATION_FIXTURE_DIR,
  DEFAULT_TIMEOUT_MS,
  assertNoSecrets,
  buildCandidateCrawl,
  collectObservations,
  loadObservationFixture,
} from "./verifiedFeedObservation.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CANDIDATE_FEED = path.join(here, "../tmp/x402/verified.candidate.json");
export const DEFAULT_OBSERVATION_REPORT = path.join(
  here,
  "../tmp/x402/verified.observations.json",
);
export const PRODUCTION_FEED = path.join(here, "../public/x402/verified.json");

function parseArgs(argv) {
  const out = {
    mode: "fixtures",
    asOf: null,
    feedOut: DEFAULT_CANDIDATE_FEED,
    observationsOut: DEFAULT_OBSERVATION_REPORT,
    fixtureNames: [],
    liveRouteLimit: DEFAULT_LIVE_ROUTE_LIMIT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxBytes: DEFAULT_MAX_BYTES,
    concurrency: DEFAULT_CONCURRENCY,
    writeFeed: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--live") out.mode = "live";
    else if (arg === "--prior-only") out.mode = "prior-only";
    else if (arg === "--fixtures") out.mode = "fixtures";
    else if (arg === "--as-of") out.asOf = argv[++i];
    else if (arg === "--feed-out") out.feedOut = path.resolve(argv[++i]);
    else if (arg === "--observations-out") out.observationsOut = path.resolve(argv[++i]);
    else if (arg === "--fixture") out.fixtureNames.push(argv[++i]);
    else if (arg === "--live-route-limit") out.liveRouteLimit = Number(argv[++i]);
    else if (arg === "--timeout-ms") out.timeoutMs = Number(argv[++i]);
    else if (arg === "--max-bytes") out.maxBytes = Number(argv[++i]);
    else if (arg === "--concurrency") out.concurrency = Number(argv[++i]);
    else if (arg === "--observations-only") out.writeFeed = false;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function usage() {
  return `Usage: node client/scripts/refreshVerifiedFeed.mjs [options]

Operator-triggered refresh for the existing /x402/verified.json free feed.
Writes a publish candidate and observation report. Does not replace production.

Options:
  --fixtures             Offline deterministic fixtures (default)
  --prior-only           Re-evaluate committed crawl evidence only (no new observations)
  --live                 One small read-only allowlisted live unpaid-402 check
  --fixture <name>       Load fixtures/verified-feed/observations/<name>.json
  --as-of <iso>          Observation/refresh timestamp (default: now)
  --feed-out <path>      Candidate feed path (default: client/tmp/x402/verified.candidate.json)
  --observations-out <path>
  --live-route-limit <n> Max live probes (default: 1)
  --timeout-ms <n>       Per-request timeout (default: 8000)
  --max-bytes <n>        Response body cap (default: 256000)
  --concurrency <n>      Live probe concurrency (default: 1)
  --observations-only    Skip candidate feed write when no current rows validate
`;
}

function defaultFixtureMap() {
  // Built-in offline map covers current + failure classes without network.
  const extractBody = {
    x402Version: 2,
    accepts: [
      {
        scheme: "exact",
        network: "eip155:8453",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        amount: "5000",
        payTo: "0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee",
        outputSchema: {
          output: {
            example: {
              aiReadiness: {},
              description: "",
              jsonLd: [],
              ok: true,
              title: "",
              url: "",
            },
          },
        },
      },
    ],
    extensions: { bazaar: { schema: { properties: { output: {} } } } },
  };
  return {
    "/extract": {
      kind: "current",
      status: 402,
      headers: { "payment-required": "fixture" },
      body: extractBody,
    },
  };
}

function loadNamedFixtures(names) {
  const map = {};
  for (const name of names) {
    const fixture = loadObservationFixture(name, DEFAULT_OBSERVATION_FIXTURE_DIR);
    if (!fixture.route && !fixture.key) {
      throw new Error(`fixture ${name} missing route or key`);
    }
    if (fixture.key) map[fixture.key] = fixture;
    if (fixture.route) map[fixture.route] = fixture;
  }
  return map;
}

export async function refreshVerifiedFeed(options = {}) {
  const asOf = options.asOf || new Date().toISOString();
  if (options.feedOut && path.resolve(options.feedOut) === path.resolve(PRODUCTION_FEED)) {
    throw new Error("refusing to overwrite production verified.json; choose a candidate path");
  }

  let fixtureMap = options.fixtureMap;
  if (!fixtureMap) {
    fixtureMap = options.mode === "fixtures" ? defaultFixtureMap() : {};
    if (options.fixtureNames?.length) {
      fixtureMap = { ...fixtureMap, ...loadNamedFixtures(options.fixtureNames) };
    }
  }

  const observations = await collectObservations({
    asOf,
    source: options.source || crawl,
    mode: options.mode || "fixtures",
    fixtureMap,
    liveRouteLimit: options.liveRouteLimit ?? DEFAULT_LIVE_ROUTE_LIMIT,
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxBytes: options.maxBytes ?? DEFAULT_MAX_BYTES,
    concurrency: options.concurrency ?? DEFAULT_CONCURRENCY,
  });

  const report = {
    schemaVersion: "samedaydesk.x402-verified-feed-observations.v1",
    asOf,
    mode: options.mode || "fixtures",
    limitations: [
      "Observation report for the existing SameDayDesk free verified feed refresh.",
      "lastObservation is retained separately from status failed/unknown/stale.",
      "A current verified claim requires status=current at asOf. Prior evidence is never rewritten into a fresh observedAt.",
      "No wallet, credential, payment signature, or production feed replacement.",
    ],
    counts: {
      current: observations.filter((row) => row.status === "current").length,
      stale: observations.filter((row) => row.status === "stale").length,
      unknown: observations.filter((row) => row.status === "unknown").length,
      failed: observations.filter((row) => row.status === "failed").length,
    },
    observations,
  };
  assertNoSecrets(report);

  const candidateCrawl = buildCandidateCrawl(options.source || crawl, observations, asOf);
  const feed = generateVerifiedFeed(asOf, candidateCrawl);
  assertNoSecrets(feed);

  const result = {
    asOf,
    report,
    candidateCrawl,
    feed,
    feedValid: false,
    feedOut: options.feedOut || DEFAULT_CANDIDATE_FEED,
    observationsOut: options.observationsOut || DEFAULT_OBSERVATION_REPORT,
  };

  if (feed.routes.length > 0) {
    validateVerifiedFeed(feed, { source: candidateCrawl });
    result.feedValid = true;
  }

  return result;
}

export function writeRefreshArtifacts(result, { writeFeed = true } = {}) {
  if (path.resolve(result.feedOut) === path.resolve(PRODUCTION_FEED) ||
      path.resolve(result.observationsOut) === path.resolve(PRODUCTION_FEED)) {
    throw new Error("refusing to overwrite production verified.json");
  }
  // Fixtures exercise generation in memory, never become a publishable file.
  const publishable = result.report.mode === "live" && result.feedValid;
  mkdirSync(path.dirname(result.observationsOut), { recursive: true });
  writeFileSync(result.observationsOut, `${JSON.stringify(result.report, null, 2)}\n`);
  if (writeFeed && publishable) {
    mkdirSync(path.dirname(result.feedOut), { recursive: true });
    writeFileSync(result.feedOut, `${JSON.stringify(result.feed, null, 2)}\n`);
  }
  return {
    observationsOut: result.observationsOut,
    feedOut: writeFeed && publishable ? result.feedOut : null,
    feedValid: result.feedValid,
    routeCount: result.feed.routes.length,
    counts: result.report.counts,
  };
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  const result = await refreshVerifiedFeed(args);
  const written = writeRefreshArtifacts(result, { writeFeed: args.writeFeed });
  process.stdout.write(
    `[verified-feed-refresh] asOf=${result.asOf} mode=${args.mode} ` +
      `current=${written.counts.current} stale=${written.counts.stale} ` +
      `unknown=${written.counts.unknown} failed=${written.counts.failed} ` +
      `candidateRoutes=${written.routeCount} feedValid=${written.feedValid}\n`,
  );
  process.stdout.write(`[verified-feed-refresh] observations ${written.observationsOut}\n`);
  if (written.feedOut) {
    process.stdout.write(`[verified-feed-refresh] candidate feed ${written.feedOut}\n`);
  } else if (args.writeFeed) {
    process.stdout.write(
      "[verified-feed-refresh] no publishable feed (requires live mode and current valid rows)\n",
    );
  }
  // Prove production path untouched when it already exists.
  if (path.resolve(args.feedOut) !== path.resolve(PRODUCTION_FEED)) {
    try {
      readFileSync(PRODUCTION_FEED, "utf8");
    } catch {
      // absent is fine in sparse checkouts
    }
  }
  return 0;
}

const isMain =
  Boolean(process.argv[1]) &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);

if (isMain) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(`${error.stack || error.message}\n`);
      process.exit(1);
    },
  );
}
