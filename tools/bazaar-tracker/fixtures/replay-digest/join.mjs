#!/usr/bin/env node
/**
 * Replay-only join of a committed bazaar-observation digest to a frozen
 * unpaid offer-receipt payload. Refuses CDP, tracker --live, and writes
 * under data/bazaar-tracker so payTo/amount cannot land in Git.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  CDP_DISCOVERY_SOURCE,
  compactRouteObservation,
  observationRecordFromSnapshot,
  routeContentDigest,
  runTracker,
  snapshotFromRows,
} from "../../lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "../../../..");
export const JOIN_SCHEMA = "samedaydesk.bazaar-replay-digest-join.v1";
export const EXTRACT_ROUTE = "https://agents.samedaydesk.com/extract";
export const COMMITTED_EXTRACT_DIGEST = "04c1554d7a4471803f05781245df70cb0ae3dc73b9df78c555c7324c3b1ca60e";
export const DEFAULT_OBSERVATIONS = join(ROOT, "data/bazaar-tracker/observations.json");
export const LIVE_PAYLOAD_KEYS = Object.freeze([
  "version",
  "resourceUrl",
  "scheme",
  "network",
  "asset",
  "payTo",
  "amount",
  "validUntil",
]);
export const REQUIRED_PAYLOAD_KEYS = Object.freeze([
  "version",
  "resourceUrl",
  "scheme",
  "network",
  "asset",
  "payTo",
  "amount",
]);
export const FORBIDDEN_COMPACT_KEYS = Object.freeze([
  "payTo",
  "amount",
  "asset",
  "network",
  "description",
  "maxAmountRequired",
  "lastCalledAt",
  "quality",
  "loyaltyPoints",
  "throughBlock",
]);
export const INVENTED_FIELDS = Object.freeze([
  "loyaltyPoints",
  "throughBlock",
  "buyerEmail",
  "npsScore",
  "tipAmount",
  "uniqueVisitors",
]);

function displayRepoPath(path) {
  const resolved = resolve(path);
  if (resolved === ROOT || resolved.startsWith(`${ROOT}/`)) {
    return resolved.slice(ROOT.length + 1) || ".";
  }
  return path;
}

function loadJson(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`cannot read ${displayRepoPath(path)}: ${error.code || "io_error"}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`invalid JSON: ${displayRepoPath(path)}`);
  }
}

function assertInside(path, root, label) {
  const resolved = resolve(path);
  const base = resolve(root);
  if (resolved !== base && !resolved.startsWith(`${base}/`)) {
    throw new Error(`${label} is outside the replay-digest fixture directory`);
  }
  return resolved;
}

function leafKey(path) {
  return String(path).split(".").pop();
}

function unwrap402(doc) {
  if (doc && typeof doc === "object" && doc.body && typeof doc.body === "object" && Array.isArray(doc.body.accepts)) {
    return { provenance: doc.provenance ?? null, body: doc.body };
  }
  return { provenance: null, body: doc };
}

export function originPathname(value) {
  try {
    const url = new URL(value);
    const path = url.pathname.replace(/\/+$/, "") || "";
    return `${url.origin}${path}`;
  } catch {
    return "";
  }
}

export function liveRowFrom402(body, { resource = null } = {}) {
  const resourceUrl = body?.resource?.url || resource || EXTRACT_ROUTE;
  return {
    seller: "SameDayDesk",
    sellerId: "samedaydesk",
    resource: originPathname(resource) || originPathname(resourceUrl) || EXTRACT_ROUTE,
    type: "http",
    x402Version: body?.x402Version ?? 2,
    description: body?.resource?.description ?? null,
    accepts: body?.accepts ?? [],
    extensions: body?.extensions ?? null,
  };
}

export function offerPayload(body) {
  const offers = body?.extensions?.["offer-receipt"]?.info?.offers;
  if (!Array.isArray(offers) || offers.length === 0) return null;
  return offers[0]?.payload && typeof offers[0].payload === "object" ? offers[0].payload : null;
}

function offerEntries(body) {
  const offers = body?.extensions?.["offer-receipt"]?.info?.offers;
  if (!Array.isArray(offers)) return [];
  return offers.filter((offer) => offer?.payload && typeof offer.payload === "object");
}

function objectKeyPaths(value, prefix = "") {
  const out = [];
  if (!value || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      out.push(...objectKeyPaths(item, prefix ? `${prefix}.${index}` : String(index)));
    });
    return out;
  }
  for (const key of Object.keys(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    out.push(path);
    out.push(...objectKeyPaths(value[key], path));
  }
  return out;
}

export function compactForbiddenHits(value) {
  const hits = [];
  for (const path of objectKeyPaths(value)) {
    if (FORBIDDEN_COMPACT_KEYS.includes(leafKey(path))) hits.push(path);
  }
  return hits;
}

function committedRoute(observations, route) {
  const sellers = observations?.sources?.[CDP_DISCOVERY_SOURCE]?.sellers ?? {};
  for (const seller of Object.values(sellers)) {
    const fields = seller?.routes?.[route];
    if (fields) {
      return {
        sellerId: seller.id,
        seller: seller.name,
        route,
        digest: fields.digest ?? null,
        observedAt: observations.observedAt ?? null,
        schema: observations.schema ?? null,
      };
    }
  }
  return null;
}

function applyPayloadMutations(body, caseDoc) {
  const clone = JSON.parse(JSON.stringify(body));
  const payload = offerPayload(clone);
  if (!payload) return clone;
  if (caseDoc.payloadOverride && typeof caseDoc.payloadOverride === "object") {
    Object.assign(payload, caseDoc.payloadOverride);
  }
  if (caseDoc.payloadExtra && typeof caseDoc.payloadExtra === "object") {
    Object.assign(payload, caseDoc.payloadExtra);
  }
  if (Array.isArray(caseDoc.payloadRemove)) {
    for (const key of caseDoc.payloadRemove) delete payload[key];
  }
  return clone;
}

function inventedFieldNames(payloads) {
  const names = [];
  for (const payload of payloads) {
    for (const key of Object.keys(payload)) {
      if (!LIVE_PAYLOAD_KEYS.includes(key)) names.push(key);
    }
    for (const name of INVENTED_FIELDS) {
      if (objectKeyPaths(payload).some((path) => leafKey(path) === name)) names.push(name);
    }
  }
  return [...new Set(names)];
}

function addReason(reasons, reason) {
  if (!reasons.includes(reason)) reasons.push(reason);
}

export function applyFromReplay(report, replay) {
  const hits = Array.isArray(replay?.forbiddenHits) ? replay.forbiddenHits : [];
  const payToHit = Boolean(replay?.payToStored) || hits.some((path) => leafKey(path) === "payTo");
  const otherHits = hits.filter((path) => leafKey(path) !== "payTo");
  report.fromReplay = {
    liveDigest: replay?.liveDigest ?? null,
    writtenDigest: replay?.writtenDigest ?? null,
    payToStored: payToHit,
    forbiddenHits: hits,
  };
  if (payToHit) {
    addReason(report.reasons, "payto_written_to_compact_observation");
    report.payToStored = true;
  }
  if (otherHits.length) {
    addReason(report.reasons, `payment_terms_written_to_compact_observation:${otherHits.join(",")}`);
  }
  if (payToHit || otherHits.length) report.ok = false;
  return report;
}

export function evaluateJoin(caseDoc, { observations, observationsPath = DEFAULT_OBSERVATIONS } = {}) {
  const reasons = [];
  const claims = caseDoc.claims && typeof caseDoc.claims === "object" ? caseDoc.claims : {};
  const route = caseDoc.committedRoute || EXTRACT_ROUTE;
  const expectedDigest = caseDoc.expectedCommittedDigest || COMMITTED_EXTRACT_DIGEST;
  const httpStatus = caseDoc.httpStatus ?? caseDoc.live402?.provenance?.httpStatus ?? null;
  const paid = caseDoc.paid === true || caseDoc.live402?.provenance?.paid === true;
  const paymentResponseHeader =
    caseDoc.paymentResponseHeader === true
    || caseDoc.live402?.provenance?.paymentResponseHeader === true;
  const body = applyPayloadMutations(caseDoc.live402.body, caseDoc);
  const row = liveRowFrom402(body, { resource: route });
  const entries = offerEntries(body);
  const payload = entries[0]?.payload ?? null;
  const liveDigest = routeContentDigest(row);
  const compact = compactRouteObservation(row);
  const compactRecord = observationRecordFromSnapshot(
    snapshotFromRows([row], {
      observedAt: caseDoc.live402?.provenance?.retrievedAt ?? null,
      source: "fixture",
    }),
  );
  const committed = committedRoute(observations, route);
  const payloadKeys = payload ? Object.keys(payload) : [];
  const inventedUnique = inventedFieldNames(entries.map((entry) => entry.payload));
  const acceptIndex = Number.isInteger(entries[0]?.acceptIndex) ? entries[0].acceptIndex : 0;
  const accept = row.accepts?.[acceptIndex] ?? row.accepts?.[0] ?? null;
  const acceptAmount = accept?.amount ?? null;
  const payloadAmount = payload?.amount ?? null;
  const acceptPayTo = accept?.payTo ?? null;
  const payloadPayTo = payload?.payTo ?? null;
  const amountMatchesAccepts = acceptAmount != null && payloadAmount != null && String(acceptAmount) === String(payloadAmount);
  const joinLeft = originPathname(route);
  const joinRight = originPathname(payload?.resourceUrl || body?.resource?.url || "");
  const joinKeyMatch = Boolean(joinLeft && joinRight && joinLeft === joinRight);
  const compactHits = [
    ...compactForbiddenHits(compact),
    ...compactForbiddenHits(compactRecord),
    ...compactForbiddenHits(caseDoc.compactObservationAttempt || null),
  ];
  const missingRequired = payload
    ? REQUIRED_PAYLOAD_KEYS.filter((key) => payload[key] == null)
    : [];

  if (httpStatus !== 402) {
    addReason(reasons, `unpaid_402_required:http=${httpStatus}`);
  }
  if (paid) {
    addReason(reasons, "paid_unpaid_402");
  }
  if (claims.paymentResponse === true || claims.hasPaymentResponse === true || paymentResponseHeader) {
    addReason(reasons, "payment_response_claimed_on_unpaid_402");
  }
  if (claims.builderCodeIsBuyerIdentity === true) {
    addReason(reasons, "builder_code_is_not_buyer_identity");
  }
  if (claims.treatAbsenceAsDemand === true) {
    addReason(reasons, "treat_absence_as_demand");
  }
  if (!payload) {
    addReason(reasons, "offer_receipt_payload_missing");
  }
  if (inventedUnique.length) {
    addReason(reasons, `invented_receipt_field_without_live_schema:${inventedUnique.join(",")}`);
  }
  if (missingRequired.length) {
    addReason(reasons, `missing_required_payload_key:${missingRequired.join(",")}`);
  }
  if (payload && payloadAmount != null && acceptAmount != null && !amountMatchesAccepts) {
    addReason(reasons, `amount_mismatch:accepts=${acceptAmount},payload=${payloadAmount}`);
  } else if (payload && payloadAmount != null && acceptAmount == null) {
    addReason(reasons, "amount_mismatch:accepts_missing");
  }
  if (payload && payloadPayTo != null && acceptPayTo != null && String(payloadPayTo) !== String(acceptPayTo)) {
    addReason(reasons, `payto_mismatch:accepts=${acceptPayTo},payload=${payloadPayTo}`);
  }
  if (payload && joinLeft && joinRight && !joinKeyMatch) {
    addReason(reasons, `join_key_mismatch:left=${joinLeft},right=${joinRight}`);
  }
  if (!committed) {
    addReason(reasons, `route_absent:${route}`);
  } else if (expectedDigest && committed.digest !== expectedDigest) {
    addReason(reasons, `committed_digest_unexpected:${committed.digest}`);
  }
  if (compactHits.some((path) => leafKey(path) === "payTo")) {
    addReason(reasons, "payto_written_to_compact_observation");
  }
  const otherHits = compactHits.filter((path) => leafKey(path) !== "payTo");
  if (otherHits.length) {
    addReason(reasons, `payment_terms_written_to_compact_observation:${otherHits.join(",")}`);
  }

  const digestMatch = Boolean(committed && liveDigest === committed.digest);
  const payToPresent = payload ? payload.payTo != null : false;
  const payToStored = compactHits.some((path) => leafKey(path) === "payTo");

  return {
    schema: JOIN_SCHEMA,
    id: caseDoc.id ?? null,
    ok: reasons.length === 0,
    reasons,
    cron: false,
    daemon: false,
    live: false,
    paid: false,
    httpStatus,
    joinKey: {
      kind: "origin_pathname",
      left: joinLeft || null,
      right: joinRight || null,
      match: joinKeyMatch,
    },
    committed: committed
      ? {
          route,
          observedAt: committed.observedAt,
          schema: committed.schema,
          digest: committed.digest,
          observationsPath: displayRepoPath(observationsPath),
        }
      : { route, digest: null, observationsPath: displayRepoPath(observationsPath) },
    liveDigest,
    digestMatch,
    payloadKeys,
    amountMatchesAccepts,
    payToPresent,
    payToStored,
    compactObservation: {
      digest: compact.digest,
    },
    absenceIsDemand: false,
  };
}

export function loadCase(path, { observationsPath = DEFAULT_OBSERVATIONS } = {}) {
  const casePath = isAbsolute(path) ? path : resolve(path);
  const caseDoc = loadJson(casePath);
  const livePath = caseDoc.live402Path
    ? (isAbsolute(caseDoc.live402Path) ? caseDoc.live402Path : resolve(dirname(casePath), caseDoc.live402Path))
    : join(here, "live/extract-402.json");
  const confinedLive = assertInside(livePath, here, "live402Path");
  const live402 = unwrap402(loadJson(confinedLive));
  const observations = loadJson(observationsPath);
  return {
    casePath,
    caseDoc: { ...caseDoc, live402 },
    observations,
    observationsPath,
  };
}

export async function replayThroughTracker(caseDoc) {
  const dataDir = mkdtempSync(join(tmpdir(), "replay-digest-"));
  try {
    const route = caseDoc.committedRoute || EXTRACT_ROUTE;
    const body = applyPayloadMutations(caseDoc.live402.body, caseDoc);
    const row = liveRowFrom402(body, { resource: route });
    const snapshot = snapshotFromRows([row], {
      observedAt: caseDoc.live402?.provenance?.retrievedAt ?? "2026-09-17T12:44:15.000Z",
      source: "fixture",
      sellers: [
        {
          id: "samedaydesk",
          name: "SameDayDesk",
          hosts: ["agents.samedaydesk.com"],
          queries: ["agents.samedaydesk.com"],
          partial: false,
          rowCount: 1,
        },
      ],
    });
    const report = await runTracker({
      cohort: { endpoint: "https://invalid.example/discovery", sellers: [{ id: "samedaydesk", name: "SameDayDesk", hosts: ["agents.samedaydesk.com"] }] },
      dataDir,
      incomingSnapshot: snapshot,
      observedAt: snapshot.observedAt,
      source: "fixture",
    });
    const written = loadJson(report.observationPath);
    const hits = compactForbiddenHits(written);
    return {
      dataDir,
      observationPath: report.observationPath,
      liveDigest: routeContentDigest(row),
      writtenDigest: written?.sources?.[CDP_DISCOVERY_SOURCE]?.sellers?.samedaydesk?.routes?.[row.resource]?.digest ?? null,
      payToStored: hits.some((path) => leafKey(path) === "payTo"),
      forbiddenHits: hits,
      changeCount: report.changeCount,
    };
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
}

function isSeededCase(caseDoc, path) {
  if (caseDoc.kind === "seeded") return true;
  const name = String(caseDoc.id || path || "");
  return name.includes("seeded");
}

export function listCaseFiles(dir = join(here, "cases")) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => join(dir, name));
}

function printUsage() {
  process.stderr.write(`Replay digest ↔ offer-receipt join (offline; no CDP, no --live, no pay).

Usage:
  node tools/bazaar-tracker/fixtures/replay-digest/join.mjs [--pretty] CASE.json
  node tools/bazaar-tracker/fixtures/replay-digest/join.mjs --seeded CASE.json
  node tools/bazaar-tracker/fixtures/replay-digest/join.mjs --suite
  node tools/bazaar-tracker/fixtures/replay-digest/join.mjs --from-replay CASE.json

--seeded       exit 0 only when the case is rejected (anti-greenwash)
--suite        cold cases must pass; seeded cases must reject
--from-replay  hash through bazaar-tracker runTracker in a temp data-dir
--observations path to committed observations.json
--pretty       indent JSON

Does not write data/bazaar-tracker. Compact observation keys stay [digest].
Refuses --live, --cdp, and --pay.
`);
}

async function main() {
  let values;
  let positionals;
  try {
    ({ values, positionals } = parseArgs({
      allowPositionals: true,
      options: {
        pretty: { type: "boolean", default: false },
        seeded: { type: "boolean", default: false },
        suite: { type: "boolean", default: false },
        "from-replay": { type: "boolean", default: false },
        observations: { type: "string" },
        live: { type: "boolean", default: false },
        cdp: { type: "boolean", default: false },
        pay: { type: "boolean", default: false },
        help: { type: "boolean", default: false },
      },
    }));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    printUsage();
    process.exit(2);
  }

  if (values.live || values.cdp || values.pay) {
    process.stderr.write("Replay digest join refuses --live, --cdp, and --pay.\n");
    process.exit(2);
  }

  if (values.help || (!values.suite && positionals.length === 0)) {
    printUsage();
    process.exit(values.help ? 0 : 2);
  }

  if (values.suite && positionals.length) {
    process.stderr.write("Pass --suite without CASE.json.\n");
    process.exit(2);
  }

  const indent = values.pretty ? 2 : 0;
  const observationsPath = values.observations
    ? resolve(values.observations)
    : DEFAULT_OBSERVATIONS;

  if (values.suite) {
    const reports = [];
    let failed = false;
    for (const path of listCaseFiles()) {
      const loaded = loadCase(path, { observationsPath });
      const report = evaluateJoin(loaded.caseDoc, {
        observations: loaded.observations,
        observationsPath,
      });
      const seeded = isSeededCase(loaded.caseDoc, path);
      const ok = seeded ? !report.ok : report.ok;
      if (!ok) failed = true;
      reports.push({
        path,
        id: report.id,
        seeded,
        expected: seeded ? "reject" : "ok",
        ok,
        reasons: report.reasons,
        digestMatch: report.digestMatch,
        payToStored: report.payToStored,
      });
    }
    process.stdout.write(`${JSON.stringify({ schema: JOIN_SCHEMA, ok: !failed, reports }, null, indent)}\n`);
    process.exit(failed ? 1 : 0);
  }

  if (positionals.length !== 1) {
    process.stderr.write("Pass exactly one CASE.json (or --suite).\n");
    process.exit(2);
  }

  const loaded = loadCase(positionals[0], { observationsPath });
  const report = evaluateJoin(loaded.caseDoc, {
    observations: loaded.observations,
    observationsPath,
  });

  if (values["from-replay"]) {
    const replay = await replayThroughTracker(loaded.caseDoc);
    applyFromReplay(report, replay);
  }

  process.stdout.write(`${JSON.stringify(report, null, indent)}\n`);
  if (values.seeded) {
    process.exit(report.ok ? 1 : 0);
  }
  process.exit(report.ok ? 0 : 1);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(2);
  }
}
