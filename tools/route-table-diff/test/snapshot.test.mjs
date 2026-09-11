import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { SPA_ROUTE_SHELLS, HOME_CANONICAL, HOME_TITLE } from "../../../server/lib/spa-route-shells.js";
import { PUBLIC_SHELL_PATHS, PUBLIC_SHELLS_SNAPSHOT, SOURCE_PIN } from "../lib/constants.mjs";

const here = dirname(fileURLToPath(import.meta.url));

test("copied PUBLIC_SHELLS snapshot matches live spa-route-shells at the pinned fields", () => {
  const snapshot = JSON.parse(readFileSync(PUBLIC_SHELLS_SNAPSHOT, "utf8"));
  assert.equal(snapshot.publishedRouteTable, false);
  assert.equal(snapshot.source.sha, SOURCE_PIN.sha);
  assert.equal(snapshot.source.path, SOURCE_PIN.spaRouteShells);
  assert.equal(snapshot.source.symbol, "PUBLIC_SHELLS");
  assert.deepEqual(snapshot.routes.map((route) => route.path), [...PUBLIC_SHELL_PATHS]);

  for (const route of snapshot.routes) {
    const live = SPA_ROUTE_SHELLS.find((item) => item.path === route.path);
    assert.ok(live, `live shell missing ${route.path}`);
    assert.equal(route.title, live.title);
    assert.equal(route.canonical, live.canonical);
    assert.equal(route.robots ?? null, live.robots ?? null);
  }

  assert.equal(snapshot.routes.some((route) => route.path === "/"), false);
  assert.equal(SPA_ROUTE_SHELLS.some((route) => route.path === "/"), false);
  assert.equal(HOME_CANONICAL, "https://samedaydesk.com/");
  assert.equal(HOME_TITLE, "SameDayDesk: agent commerce, built and shipped");
});

test("this module does not import shell writers or edit homepage generators", () => {
  const files = ["bin/route-diff.mjs", "lib/index.mjs", "lib/catalog.mjs", "lib/io.mjs", "lib/diff.mjs"];
  for (const rel of files) {
    const source = readFileSync(join(here, "..", rel), "utf8");
    assert.equal(source.includes("writeRouteShells"), false, rel);
    assert.equal(source.includes("applyRouteShell"), false, rel);
    assert.equal(source.includes("client/index.html"), false, rel);
  }
});
