import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { liveShellCatalog } from "../lib/live-shells.mjs";
import { ENGINE_SHA } from "../lib/pin.mjs";
import { fixture, parseStdout, runConsumer, tmpOut } from "./helpers.mjs";

test("routes-wrapper: independent SDS catalogs add /x402 and change /terms canonical", () => {
  const outDir = tmpOut();
  const result = runConsumer([
    "--before",
    fixture("supported", "routes-before.json"),
    "--after",
    fixture("supported", "routes-after.json"),
    "--out-dir",
    outDir,
  ]);
  const body = parseStdout(result);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(body.ok, true);
  assert.equal(body.analysis, "change");
  assert.equal(body.format.before, "routes-wrapper");
  assert.equal(body.format.after, "routes-wrapper");
  assert.equal(body.publishedRouteTable, false);
  assert.equal(body.paid, false);
  assert.equal(body.settled, false);
  assert.equal(body.purchaseAuthority, false);
  assert.equal(body.enginePin.expectedSha, ENGINE_SHA);
  assert.equal(body.enginePin.sha, ENGINE_SHA);
  assert.ok(body.added.includes("/x402"));
  const terms = body.changed.find((item) => item.path === "/terms");
  assert.ok(terms);
  assert.deepEqual(terms.fields, ["canonical"]);
  const json = JSON.parse(readFileSync(join(outDir, "route-diff.json"), "utf8"));
  assert.equal(json.schema, "samedaydesk.route-diff.v1");
  assert.equal(json.counts.added, 1);
  assert.match(readFileSync(join(outDir, "route-diff.md"), "utf8"), /\/x402/);
});

test("catalog-wrapper and raw-array are accepted current-pin envelopes", () => {
  const outDir = tmpOut();
  const catalog = parseStdout(
    runConsumer([
      "--before",
      fixture("supported", "catalog-before.json"),
      "--after",
      fixture("supported", "routes-before.json"),
      "--out-dir",
      outDir,
    ]),
  );
  assert.equal(catalog.ok, true);
  assert.equal(catalog.analysis, "no-change");
  assert.equal(catalog.format.before, "catalog-wrapper");
  assert.equal(catalog.digestOrderSensitive, false);

  const raw = parseStdout(
    runConsumer([
      "--before",
      fixture("supported", "raw-before.json"),
      "--after",
      fixture("supported", "routes-before.json"),
      "--out-dir",
      tmpOut(),
    ]),
  );
  assert.equal(raw.ok, true);
  assert.equal(raw.analysis, "no-change");
  assert.equal(raw.format.before, "raw-array");
});

test("identical catalogs are a valid no-change analysis, not a crash", () => {
  const body = parseStdout(
    runConsumer([
      "--before",
      fixture("supported", "routes-before.json"),
      "--after",
      fixture("supported", "routes-before.json"),
      "--out-dir",
      tmpOut(),
    ]),
  );
  assert.equal(body.ok, true);
  assert.equal(body.analysis, "no-change");
  assert.equal(body.counts.added, 0);
  assert.equal(body.counts.removed, 0);
  assert.equal(body.counts.changed, 0);
  assert.equal(body.tableDigest.before, body.tableDigest.after);
});

test("live SPA_ROUTE_SHELLS on this checkout is a supported caller catalog", () => {
  const outDir = tmpOut();
  const catalog = liveShellCatalog();
  assert.ok(catalog.routes.some((route) => route.path === "/for-agents/useful-jobs"));
  assert.ok(catalog.routes.some((route) => route.path === "/x402"));
  assert.equal(catalog.routes.some((route) => route.path === "/"), false);
  const beforePath = join(outDir, "live-before.json");
  const afterPath = join(outDir, "live-after.json");
  writeFileSync(beforePath, `${JSON.stringify(catalog, null, 2)}\n`);
  writeFileSync(afterPath, `${JSON.stringify(catalog, null, 2)}\n`);
  const body = parseStdout(
    runConsumer(["--before", beforePath, "--after", afterPath, "--out-dir", join(outDir, "diff")]),
  );
  assert.equal(body.ok, true);
  assert.equal(body.analysis, "no-change");
  assert.equal(body.format.before, "routes-wrapper");
  assert.ok(body.enginePin.sha);
});
