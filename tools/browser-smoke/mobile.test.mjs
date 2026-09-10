import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { findChrome } from "./lib.mjs";
import { runMobileSmoke } from "./mobile.mjs";

const chrome = findChrome();

test("lockfile still has no Playwright or Puppeteer for the mobile smoke", async () => {
  const { readFileSync } = await import("node:fs");
  const { dirname, join: pathJoin } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = pathJoin(dirname(fileURLToPath(import.meta.url)), "../..");
  const rootLock = readFileSync(pathJoin(root, "package-lock.json"), "utf8");
  const clientLock = readFileSync(pathJoin(root, "client/package-lock.json"), "utf8");
  assert.equal(rootLock.includes("playwright"), false);
  assert.equal(rootLock.includes("puppeteer"), false);
  assert.equal(clientLock.includes("\"playwright\""), false);
  assert.equal(clientLock.includes("\"puppeteer\""), false);
  assert.ok(chrome, "expected /opt/google/chrome/google-chrome or CHROME_BIN");
});

test(
  "mobile viewport accepts the same local mocked SDS agent and recurring-job fixture surfaces as desktop",
  { skip: chrome ? false : "system Chrome not installed", timeout: 120_000 },
  async () => {
    const outDir = mkdtempSync(join(tmpdir(), "sds-browser-mobile-"));
    const report = await runMobileSmoke({ outDir });
    assert.equal(report.ok, true, JSON.stringify(report.failures, null, 2));
    assert.equal(report.viewport.width, 390);
    assert.equal(report.viewport.height, 844);
    assert.equal(report.productionHits.length, 0);
    const forAgents = report.pages.find((page) => page.id === "for-agents");
    const recordRepeat = report.pages.find((page) => page.id === "record-repeat");
    const distributionRepair = report.pages.find((page) => page.id === "distribution-repair");
    assert.ok(recordRepeat, "record-repeat page missing");
    assert.ok(distributionRepair, "distribution-repair page missing");
    assert.match(recordRepeat.h1 || "", /portable offline package/i);
    assert.match(distributionRepair.h1 || "", /portable diagnosis package/i);

    assert.equal(forAgents.innerWidth, 390);
    assert.equal(recordRepeat.innerWidth, 390);
    assert.equal(distributionRepair.innerWidth, 390);
    assert.equal(forAgents.linksDisplay, "none");
    assert.equal(forAgents.x402LabelDisplay, "none");
    assert.equal(forAgents.signinDisplay, "none");
    assert.equal(forAgents.wordDisplay, "none");
    assert.ok(forAgents.preOverflowX === "auto" || forAgents.preOverflowX === "scroll");
    const fixture = report.pages.find((page) => page.id === "fixture-example-a");
    assert.equal(fixture.h1, "Alpha");
  },
);
