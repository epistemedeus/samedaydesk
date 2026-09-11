import { tableDigest } from "./digest.mjs";
import { SCHEMA_DIFF } from "./constants.mjs";

function robotsOf(route) {
  return route.robots ?? null;
}

export function diffRouteTables(before, after, meta = {}) {
  const beforeMap = new Map(before.routes.map((route) => [route.path, route]));
  const afterMap = new Map(after.routes.map((route) => [route.path, route]));

  const added = [];
  const removed = [];
  const changed = [];
  const titleOnly = [];

  for (const route of after.routes) {
    if (!beforeMap.has(route.path)) added.push(route);
  }
  for (const route of before.routes) {
    if (!afterMap.has(route.path)) removed.push(route);
  }
  for (const route of after.routes) {
    const prev = beforeMap.get(route.path);
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
    tableDigest: {
      before: tableDigest(before.routes),
      after: tableDigest(after.routes),
    },
    counts: {
      added: added.length,
      removed: removed.length,
      changed: changed.length,
      titleOnly: titleOnly.length,
    },
    added,
    removed,
    changed,
    titleOnly,
    notes: [
      "changed lists canonical or robots only. Title-only edits are titleOnly, not a canonical/robots change.",
      "This artifact is not a published SDS route table and does not rewrite the homepage or spa-route-shells.js.",
      "Fixture, local-runtime, and external stay distinct. Local HTTP loopback is local-runtime. SAMPLE is fixture.",
    ],
  };
}
