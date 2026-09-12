import { tableDigest } from "./digest.mjs";
import { SCHEMA_DIFF } from "./constants.mjs";
import { routeIdentityKey } from "./identity.mjs";
import { refused } from "./errors.mjs";
import { sameFrameworkConfig } from "./express.mjs";

function robotsOf(route) {
  return route.robots ?? null;
}

function publicRoute(route) {
  if (route.kind === "express") {
    return {
      method: route.method,
      path: route.path,
      matchSignature: route.matchSignature,
    };
  }
  return {
    path: route.path,
    canonical: route.canonical,
    title: route.title,
    robots: robotsOf(route),
  };
}

function pathSequence(routes) {
  return routes.map((route) => route.matchKey ?? route.path);
}

function routeMapKey(route) {
  return route.matchKey ?? route.path;
}

function identitySet(records) {
  return [...records].map(routeIdentityKey).sort();
}

export function classifyRouteDiff({
  collisions = [],
  removed = [],
  changed = [],
  added = [],
  titleOnly = [],
  orderChanged = false,
} = {}) {
  if ((collisions && collisions.length) || (removed && removed.length)) {
    return { breaking: true, outcome: "breaking" };
  }
  if ((changed && changed.length) || (added && added.length)) {
    return { breaking: false, outcome: "changed" };
  }
  if (titleOnly && titleOnly.length) {
    return { breaking: false, outcome: "title-only" };
  }
  if (orderChanged) {
    return { breaking: false, outcome: "permutation" };
  }
  return { breaking: false, outcome: "no-change" };
}

export function diffRouteTables(before, after, meta = {}) {
  if (before.kind !== after.kind) {
    refused(
      "incompatible_catalogs",
      "SDS and framework catalogs cannot be forced into one route identity comparison.",
      { before: before.kind ?? "unknown", after: after.kind ?? "unknown" },
    );
  }
  if (before.kind === "express" && !sameFrameworkConfig(before.framework, after.framework)) {
    refused(
      "incompatible_catalogs",
      "Express framework version and caseSensitive/strict settings must match across a comparison.",
      { before: before.framework, after: after.framework },
    );
  }

  const beforeMap = new Map(before.routes.map((route) => [routeMapKey(route), route]));
  const afterMap = new Map(after.routes.map((route) => [routeMapKey(route), route]));

  const added = [];
  const removed = [];
  const changed = [];
  const titleOnly = [];

  for (const route of after.routes) {
    if (!beforeMap.has(routeMapKey(route))) added.push(publicRoute(route));
  }
  for (const route of before.routes) {
    if (!afterMap.has(routeMapKey(route))) removed.push(publicRoute(route));
  }
  if (before.kind !== "express") {
    for (const route of after.routes) {
      const prev = beforeMap.get(routeMapKey(route));
      if (!prev) continue;
      const fields = [];
      if (prev.canonical !== route.canonical) fields.push("canonical");
      if (robotsOf(prev) !== robotsOf(route)) fields.push("robots");
      if (fields.length) {
        changed.push({
          path: route.path,
          fields,
          before: { canonical: prev.canonical, robots: robotsOf(prev), title: prev.title },
          after: { canonical: route.canonical, robots: robotsOf(route), title: route.title },
        });
      } else if (prev.title !== route.title) {
        titleOnly.push({
          path: route.path,
          before: prev.title,
          after: route.title,
        });
      }
    }
  }

  const collisions = [
    ...(before.collisions || []).map((item) => ({ ...item, side: "before" })),
    ...(after.collisions || []).map((item) => ({ ...item, side: "after" })),
  ];

  const beforeRecords = before.records || before.routes;
  const afterRecords = after.records || after.routes;
  const sameIdentities =
    JSON.stringify(identitySet(beforeRecords)) === JSON.stringify(identitySet(afterRecords));
  const orderChanged =
    JSON.stringify(pathSequence(before.routes)) !== JSON.stringify(pathSequence(after.routes)) &&
    sameIdentities &&
    collisions.length === 0;

  const classified = classifyRouteDiff({
    collisions,
    removed,
    changed,
    added,
    titleOnly,
    orderChanged,
  });

  const evidenceClass = {
    before: meta.beforeClass || (before.sample ? "fixture" : "caller"),
    after: meta.afterClass || (after.sample ? "fixture" : "caller"),
  };

  return {
    schema: SCHEMA_DIFF,
    ok: true,
    publishedRouteTable: false,
    sample: Boolean(before.sample || after.sample || meta.example),
    evidenceClass,
    catalogKind: before.kind,
    framework: before.kind === "express" ? before.framework : null,
    breaking: classified.breaking,
    outcome: classified.outcome,
    orderChanged,
    tableDigest: {
      before: tableDigest(beforeRecords),
      after: tableDigest(afterRecords),
    },
    counts: {
      added: added.length,
      removed: removed.length,
      changed: changed.length,
      titleOnly: titleOnly.length,
      collisions: collisions.length,
    },
    added,
    removed,
    changed,
    titleOnly,
    collisions,
    notes: [
      "Permutation of the same routes is not a breaking change. tableDigest is order-independent.",
      "breaking is true only for route collisions or removals. Express collisions include an exact method/path matcher witness.",
      "changed lists canonical or robots only. Title-only edits are titleOnly, not a canonical/robots change.",
      "Express 5 comparison requires explicit caseSensitive/strict settings and supports only its documented matcher-proved subset; other formats refuse.",
      "This artifact is not a published SDS route table and does not rewrite the homepage or spa-route-shells.js.",
      "Fixture, local-runtime, and external stay distinct. Local HTTP loopback is local-runtime. SAMPLE is fixture.",
      "A collision or valid no-change report is an analysis outcome, not a transport or engine failure.",
    ],
  };
}
