import { SPA_HISTORY_ROUTES } from "../../../../server/lib/spa-fallback.js";
import { SPA_ROUTE_SHELLS } from "../../../../server/lib/spa-route-shells.js";
import { SCHEMA_API, SCHEMA_SPA, SDS52_SHA, SITE_ORIGIN } from "./pins.mjs";

export function spaRecords(routes = SPA_ROUTE_SHELLS) {
  return routes.map((route) => ({
    path: route.path,
    title: route.title,
    canonical: route.canonical,
    robots: route.robots || null,
  }));
}

export function spaCatalog(routes = SPA_ROUTE_SHELLS, extra = {}) {
  return {
    schema: SCHEMA_SPA,
    publishedRouteTable: false,
    source: {
      kind: "sds52-spa-route-shells",
      module: "server/lib/spa-route-shells.js",
      symbol: "SPA_ROUTE_SHELLS",
      sha: SDS52_SHA,
    },
    ...extra,
    routes: spaRecords(routes),
  };
}

export function permuteRecords(records, mode = "reverse") {
  const copy = [...records];
  if (mode === "reverse") return copy.reverse();
  if (mode === "sort-desc") {
    return copy.sort((a, b) => (a.path < b.path ? 1 : a.path > b.path ? -1 : 0));
  }
  return copy;
}

export function historyHomepageRecord() {
  return {
    path: "/",
    title: "SameDayDesk: agent commerce, built and shipped",
    canonical: `${SITE_ORIGIN}/`,
  };
}

export function declaredHistoryPaths() {
  return [...SPA_HISTORY_ROUTES];
}

export function apiCatalog(routes, extra = {}) {
  return {
    schema: SCHEMA_API,
    publishedRouteTable: false,
    source: {
      kind: "sds52-observed-http",
      sha: SDS52_SHA,
    },
    ...extra,
    routes,
  };
}

/** Co12 identity is path-only. Method-aware API rows stay distinct until this mapping. */
export function mapApiRowsToCo12(apiRows) {
  return apiRows.map((row) => ({
    path: row.path,
    title: `${row.method} ${row.path} | SameDayDesk API`,
    canonical: `${SITE_ORIGIN}${row.path.split("?")[0]}`,
  }));
}

export function co12Catalog(routes, extra = {}) {
  return {
    schema: SCHEMA_SPA,
    publishedRouteTable: false,
    ...extra,
    routes,
  };
}
