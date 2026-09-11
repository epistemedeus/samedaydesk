import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { REPO_ROOT } from "./pin.mjs";

const shellsUrl = pathToFileURL(join(REPO_ROOT, "server/lib/spa-route-shells.js")).href;
const { SPA_ROUTE_SHELLS, SITE_ORIGIN } = await import(shellsUrl);

export function recordsFromLiveShells() {
  return SPA_ROUTE_SHELLS.filter((route) => route.path !== "/").map((route) => {
    const record = {
      path: route.path,
      title: route.title,
      canonical: route.canonical,
    };
    if (typeof route.robots === "string" && route.robots) record.robots = route.robots;
    return record;
  });
}

export function liveShellCatalog({ excludePaths = [], reverse = false } = {}) {
  const skip = new Set(excludePaths);
  let routes = recordsFromLiveShells().filter((route) => !skip.has(route.path));
  if (reverse) routes = [...routes].reverse();
  return {
    schema: "samedaydesk.route-table.v1",
    publishedRouteTable: false,
    authority: "caller",
    note: "Independent consumer catalog from live SPA_ROUTE_SHELLS on this checkout. Not the published table and not Co12's copied snapshot.",
    routes,
  };
}

export { SITE_ORIGIN };
