import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CDP_DISCOVERY_SOURCE } from "./lib.mjs";

export const EIGHT_VS_TWENTY_SIX_SCHEMA = "samedaydesk.bazaar-8-vs-26.v1";
export const SDS_SELLER_ID = "samedaydesk";
export const DEFAULT_EVIDENCE_FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/evidence-ops-1.23.49.json",
);
export const FORBIDDEN_INVENTED_FIELDS = Object.freeze([
  "loyaltyPoints",
  "throughBlock",
  "buyerEmail",
  "npsScore",
  "tipAmount",
  "uniqueVisitors",
]);
export const COMMITTED_SDS_PATHS = Object.freeze([
  "/deep-audit",
  "/defi/morpho-position",
  "/enrich",
  "/extract",
  "/read",
  "/scan",
  "/schemaforge",
  "/wallet-enrich",
]);
export const REQUIRED_LIVE_UNTRACKED = Object.freeze([
  { method: "GET", path: "/commerce/settlement-proof" },
  { method: "POST", path: "/extract/batch" },
]);
export const ABSENCE_IS_NOT_DEMAND = "catalog_absence_is_not_demand";

export function pathFromResource(resource) {
  if (typeof resource !== "string" || resource.length === 0) return "";
  try {
    const url = new URL(resource);
    return normalizePath(url.pathname);
  } catch {
    return resource.startsWith("/") ? normalizePath(resource) : "";
  }
}

export function normalizePath(path) {
  if (typeof path !== "string" || path.length === 0) return "";
  const trimmed = path.replace(/\/+$/, "");
  return trimmed.length === 0 ? "/" : trimmed;
}

export function opKey(method, path) {
  return `${String(method || "").toUpperCase()} ${normalizePath(path)}`;
}

export function sdsRoutesFromObservation(observation, sellerId = SDS_SELLER_ID) {
  const seller = observation?.sources?.[CDP_DISCOVERY_SOURCE]?.sellers?.[sellerId];
  if (!seller) {
    throw new Error(`SDS seller ${sellerId} missing from observation`);
  }
  const urls = Object.keys(seller.routes || {}).sort();
  const routes = urls.map((route) => ({
    route,
    path: pathFromResource(route),
    digest: seller.routes[route]?.digest ?? null,
  }));
  const paths = [...new Set(routes.map((row) => row.path).filter(Boolean))].sort();
  return {
    sellerId,
    name: seller.name ?? null,
    declaredRowCount: seller.rowCount ?? null,
    rowCount: paths.length,
    partial: Boolean(seller.partial),
    routes,
    paths,
  };
}

export function normalizeEvidenceOperations(doc) {
  const operations = Array.isArray(doc?.operations) ? doc.operations : [];
  return operations.map((op, index) => {
    const method = String(op?.method || "").toUpperCase();
    const path = pathFromResource(op?.path || op?.resource || "");
    if (!method || !path) {
      throw new Error(`evidence operation ${index} missing method/path`);
    }
    return {
      method,
      path,
      receiptX402: op?.receipt?.x402 ?? null,
    };
  });
}

export function hasOp(rows, method, path) {
  const key = opKey(method, path);
  return (rows ?? []).some((row) => opKey(row.method, row.path) === key);
}

function sortOps(rows) {
  return [...rows].sort((left, right) => opKey(left.method, left.path).localeCompare(opKey(right.method, right.path)));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function inventedFieldHits(value) {
  const blob = typeof value === "string" ? value : JSON.stringify(value ?? {});
  return FORBIDDEN_INVENTED_FIELDS.filter((name) => new RegExp(`\\b${escapeRegExp(name)}\\b`).test(blob));
}

export function diffSdsRoutesToEvidence(observation, evidence, {
  expectedSdsRowCount = 8,
  expectedEvidenceOpCount = 26,
  expectedSdsPaths = COMMITTED_SDS_PATHS,
  requireLiveUntracked = REQUIRED_LIVE_UNTRACKED,
} = {}) {
  const sds = sdsRoutesFromObservation(observation);
  const ops = normalizeEvidenceOperations(evidence);
  const trackedPaths = new Set(sds.paths);
  const evidencePaths = new Set(ops.map((row) => row.path));

  const trackedAndLive = [];
  const liveUntracked = [];
  const seenOps = new Set();
  const reasons = [];
  for (const op of ops) {
    const key = opKey(op.method, op.path);
    if (seenOps.has(key)) {
      reasons.push(`duplicate_evidence_op:${key}`);
    }
    seenOps.add(key);
    if (trackedPaths.has(op.path)) {
      const route = sds.routes.find((row) => row.path === op.path);
      trackedAndLive.push({
        method: op.method,
        path: op.path,
        route: route?.route ?? null,
        class: "tracked-and-live",
        receiptX402: op.receiptX402,
      });
    } else {
      liveUntracked.push({
        method: op.method,
        path: op.path,
        class: "live-untracked",
        buyerDemand: false,
        reason: ABSENCE_IS_NOT_DEMAND,
        receiptX402: op.receiptX402,
      });
    }
  }

  const trackedNotInEvidence = sds.routes
    .filter((row) => row.path && !evidencePaths.has(row.path))
    .map((row) => ({
      path: row.path,
      route: row.route,
      class: "tracked-not-in-evidence",
      buyerDemand: false,
      reason: ABSENCE_IS_NOT_DEMAND,
    }))
    .sort((left, right) => left.path.localeCompare(right.path) || String(left.route).localeCompare(String(right.route)));

  if (sds.declaredRowCount != null && sds.declaredRowCount !== sds.rowCount) {
    reasons.push(`sds_row_count_declared_${sds.declaredRowCount}:actual_${sds.rowCount}`);
  }
  if (expectedSdsRowCount != null && sds.rowCount !== expectedSdsRowCount) {
    reasons.push(`sds_row_count_expected_${expectedSdsRowCount}:got_${sds.rowCount}`);
  }
  if (expectedSdsPaths != null) {
    const expectedPaths = [...expectedSdsPaths].map((path) => normalizePath(path)).filter(Boolean).sort();
    if (expectedPaths.join("\n") !== sds.paths.join("\n")) {
      reasons.push(`sds_paths_mismatch:got_${sds.paths.join(",")}`);
    }
  }
  if (evidence?.operationCount != null && Number(evidence.operationCount) !== ops.length) {
    reasons.push(`evidence_operation_count_declared_${evidence.operationCount}:actual_${ops.length}`);
  }
  if (expectedEvidenceOpCount != null && ops.length !== expectedEvidenceOpCount) {
    reasons.push(`evidence_op_count_expected_${expectedEvidenceOpCount}:got_${ops.length}`);
  }
  if (trackedNotInEvidence.length > 0) {
    reasons.push(`tracked_not_in_evidence:${trackedNotInEvidence.map((row) => row.path).join(",")}`);
  }
  for (const required of requireLiveUntracked) {
    if (!hasOp(liveUntracked, required.method, required.path)) {
      reasons.push(`expected_live_untracked:${opKey(required.method, required.path)}`);
    }
  }

  const liveUntrackedPaths = [...new Set(liveUntracked.map((row) => row.path))].sort();

  return {
    schema: EIGHT_VS_TWENTY_SIX_SCHEMA,
    cron: false,
    daemon: false,
    liveCdp: false,
    catalogAbsenceIsDemand: false,
    absenceIsDemand: false,
    observedAt: observation?.observedAt ?? null,
    captureSource: observation?.captureSource ?? null,
    observationSchema: observation?.schema ?? null,
    service: evidence?.service ?? null,
    evidenceUrl: evidence?.pin?.url ?? evidence?.url ?? null,
    evidenceRetrievedAt: evidence?.pin?.retrievedAt ?? evidence?.retrievedAt ?? null,
    evidenceManifestDigest: evidence?.manifestDigest ?? null,
    sdsRowCount: sds.rowCount,
    sdsDeclaredRowCount: sds.declaredRowCount,
    sdsPartial: sds.partial,
    sdsPaths: sds.paths,
    evidenceOpCount: ops.length,
    trackedAndLiveCount: trackedAndLive.length,
    liveUntrackedOpCount: liveUntracked.length,
    liveUntrackedPathCount: liveUntrackedPaths.length,
    trackedNotInEvidenceCount: trackedNotInEvidence.length,
    trackedAndLive: sortOps(trackedAndLive),
    liveUntracked: sortOps(liveUntracked),
    liveUntrackedPaths,
    trackedNotInEvidence,
    reasons,
  };
}

export function evaluateEvidenceClaims(diff, claims) {
  const reasons = [];
  const invented = inventedFieldHits(claims);
  if (invented.length) {
    reasons.push(`invented_receipt_field_without_live_schema:${invented.join(",")}`);
  }
  if (claims?.treatAbsenceAsDemand === true || claims?.catalogAbsenceIsDemand === true) {
    reasons.push("treat_absence_as_demand");
  }

  const untrackedKeys = new Set((diff.liveUntracked ?? []).map((row) => opKey(row.method, row.path)));
  const trackedKeys = new Set((diff.trackedAndLive ?? []).map((row) => opKey(row.method, row.path)));
  const rows = Array.isArray(claims?.claims) ? claims.claims : [];
  for (const claim of rows) {
    const method = String(claim?.method || "").toUpperCase();
    const path = normalizePath(claim?.path || "");
    const key = opKey(method, path);
    const wantsDemand = claim?.buyerDemand === true || claim?.demand === true;
    if (!wantsDemand) continue;
    if (untrackedKeys.has(key) || !trackedKeys.has(key)) {
      reasons.push(`treat_absence_as_demand:${key}`);
    } else {
      reasons.push(`catalog_presence_is_not_demand:${key}`);
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
    invented,
  };
}

export function runEightVsTwentySix({
  observation,
  evidence,
  claims = null,
  expectedSdsRowCount = 8,
  expectedEvidenceOpCount = 26,
  expectedSdsPaths = COMMITTED_SDS_PATHS,
  requireLiveUntracked = REQUIRED_LIVE_UNTRACKED,
} = {}) {
  const diff = diffSdsRoutesToEvidence(observation, evidence, {
    expectedSdsRowCount,
    expectedEvidenceOpCount,
    expectedSdsPaths,
    requireLiveUntracked,
  });
  const claimReport = claims
    ? evaluateEvidenceClaims(diff, claims)
    : { ok: true, reasons: [], invented: [] };
  const reasons = [...diff.reasons, ...claimReport.reasons];
  return {
    ...diff,
    ok: reasons.length === 0,
    reasons,
    seededRejected: claims ? claimReport.reasons.length > 0 : null,
    invented: claimReport.invented,
  };
}
