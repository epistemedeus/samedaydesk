import {
  EXPECTED_TRACKER_COUNT,
  EXPECTED_TRACKER_PATHS,
  EXPECTED_WELLKNOWN_COUNT,
  FORBIDDEN_INVENTED_FIELDS,
  REQUIRED_WELLKNOWN_ONLY,
  WELLKNOWN_PATH,
  opKey,
} from "./catalog.mjs";

export const DIFF_SCHEMA = "samedaydesk.wellknown-ops-vs-tracker.v1";
export const ABSENCE_IS_NOT_DEMAND = "catalog_absence_is_not_demand";

export function hasPath(rows, path) {
  return (rows ?? []).some((row) => row.path === path);
}

export function hasOp(rows, method, path) {
  const key = opKey(method, path);
  return (rows ?? []).some((row) => opKey(row.method, row.path) === key);
}

export function inventedFieldHits(value) {
  const blob = typeof value === "string" ? value : JSON.stringify(value ?? {});
  return FORBIDDEN_INVENTED_FIELDS.filter((name) => new RegExp(`\\b${name}\\b`).test(blob));
}

export function diffWellKnownToTracker(wellKnown, tracker, {
  expectedWellKnownCount = EXPECTED_WELLKNOWN_COUNT,
  expectedTrackerCount = EXPECTED_TRACKER_COUNT,
  expectedTrackerPaths = EXPECTED_TRACKER_PATHS,
  requireWellKnownOnly = REQUIRED_WELLKNOWN_ONLY,
} = {}) {
  const ops = wellKnown.ops ?? [];
  const routes = tracker.routes ?? [];
  const trackerPaths = new Set(routes.map((row) => row.path).filter(Boolean));
  const wellKnownPaths = new Set(ops.map((row) => row.path).filter(Boolean));

  const inBoth = [];
  const wellKnownOnly = [];
  for (const op of ops) {
    if (trackerPaths.has(op.path)) {
      const route = routes.find((row) => row.path === op.path);
      inBoth.push({
        method: op.method,
        path: op.path,
        resource: op.resource,
        route: route?.route ?? null,
        class: "in-both",
      });
    } else {
      wellKnownOnly.push({
        method: op.method,
        path: op.path,
        resource: op.resource,
        class: "wellknown-only",
        buyerDemand: false,
        reason: ABSENCE_IS_NOT_DEMAND,
      });
    }
  }

  const trackerOnly = routes
    .filter((row) => row.path && !wellKnownPaths.has(row.path))
    .map((row) => ({
      path: row.path,
      route: row.route,
      class: "tracker-only",
      buyerDemand: false,
      reason: ABSENCE_IS_NOT_DEMAND,
    }));

  const wellKnownOnlyPaths = [...new Set(wellKnownOnly.map((row) => row.path))].sort();
  const inBothPaths = [...new Set(inBoth.map((row) => row.path))].sort();
  const trackerOnlyPaths = trackerOnly.map((row) => row.path).sort();

  const reasons = [];
  if (expectedWellKnownCount != null && ops.length !== expectedWellKnownCount) {
    reasons.push(`wellknown_count_expected_${expectedWellKnownCount}:got_${ops.length}`);
  }
  if (expectedTrackerCount != null && routes.length !== expectedTrackerCount) {
    reasons.push(`tracker_count_expected_${expectedTrackerCount}:got_${routes.length}`);
  }
  for (const path of expectedTrackerPaths) {
    if (!trackerPaths.has(path)) reasons.push(`expected_tracker_path:${path}`);
    if (!wellKnownPaths.has(path)) reasons.push(`expected_wellknown_path:${path}`);
  }
  for (const required of requireWellKnownOnly) {
    if (!hasOp(wellKnownOnly, required.method, required.path)) {
      reasons.push(`expected_wellknown_only:${opKey(required.method, required.path)}`);
    }
  }

  return {
    schema: DIFF_SCHEMA,
    cron: false,
    daemon: false,
    liveFetch: false,
    liveCdp: false,
    catalogAbsenceIsDemand: false,
    absenceIsDemand: false,
    aligned: wellKnownOnly.length === 0 && trackerOnly.length === 0,
    wellKnownSource: wellKnown.source ?? null,
    trackerSource: tracker.source ?? null,
    wellKnownPath: WELLKNOWN_PATH,
    observedAt: tracker.observedAt ?? null,
    x402Version: wellKnown.x402Version ?? null,
    wellKnownCount: ops.length,
    wellKnownPathCount: wellKnownPaths.size,
    trackerCount: routes.length,
    trackerPartial: Boolean(tracker.partial),
    inBothCount: inBoth.length,
    inBothPathCount: inBothPaths.length,
    wellKnownOnlyCount: wellKnownOnly.length,
    wellKnownOnlyPathCount: wellKnownOnlyPaths.length,
    trackerOnlyCount: trackerOnly.length,
    inBoth,
    inBothPaths,
    wellKnownOnly,
    wellKnownOnlyPaths,
    trackerOnly,
    trackerOnlyPaths,
    trackerPaths: [...trackerPaths].sort(),
    reasons,
  };
}

export function evaluateClaims(diff, claims) {
  const reasons = [];
  const invented = inventedFieldHits(claims);
  if (invented.length) {
    reasons.push(`invented_receipt_field_without_live_schema:${invented.join(",")}`);
  }
  if (claims?.treatAbsenceAsDemand === true || claims?.catalogAbsenceIsDemand === true) {
    reasons.push("treat_absence_as_demand");
  }
  if (claims?.aligned === true || claims?.claim === "aligned" || claims?.claim === "match") {
    if (!diff.aligned) reasons.push("claim_aligned_but_gap");
  }

  const wellKnownOnlyKeys = new Set((diff.wellKnownOnly ?? []).map((row) => opKey(row.method, row.path)));
  const wellKnownOnlyPaths = new Set(diff.wellKnownOnlyPaths ?? []);
  const inBothPaths = new Set(diff.inBothPaths ?? []);
  const trackerOnlyPaths = new Set(diff.trackerOnlyPaths ?? []);
  const rows = Array.isArray(claims?.claims) ? claims.claims : [];
  for (const claim of rows) {
    const method = String(claim?.method || "GET").toUpperCase();
    const path = claim?.path ? String(claim.path) : "";
    const key = opKey(method, path);
    const wantsDemand = claim?.buyerDemand === true || claim?.demand === true;
    if (wantsDemand) {
      if (wellKnownOnlyKeys.has(key) || wellKnownOnlyPaths.has(path) || trackerOnlyPaths.has(path)) {
        reasons.push(`treat_absence_as_demand:${key}`);
      } else if (inBothPaths.has(path)) {
        reasons.push(`catalog_presence_is_not_demand:${key}`);
      } else {
        reasons.push(`treat_absence_as_demand:${key}`);
      }
    }
    if (claim?.inWellKnown === true && trackerOnlyPaths.has(path)) {
      reasons.push(`ghost_tracker_claimed_wellknown:${path}`);
    }
    if (claim?.aligned === true && !diff.aligned) {
      reasons.push("claim_aligned_but_gap");
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
    invented,
  };
}

export function runDiff({
  wellKnown,
  tracker,
  claims = null,
  expectedWellKnownCount = EXPECTED_WELLKNOWN_COUNT,
  expectedTrackerCount = EXPECTED_TRACKER_COUNT,
} = {}) {
  const diff = diffWellKnownToTracker(wellKnown, tracker, {
    expectedWellKnownCount,
    expectedTrackerCount,
  });
  const claimReport = claims
    ? evaluateClaims(diff, claims)
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
