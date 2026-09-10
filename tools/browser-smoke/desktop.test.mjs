import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { findChrome } from "./lib.mjs";
import { runDesktopSmoke } from "./desktop.mjs";

const chrome = findChrome();

test("lockfile does not add Playwright or Puppeteer; system Chrome is the local browser", async () => {
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
  "desktop viewport accepts local mocked SDS agent and recurring-job fixture surfaces",
  { skip: chrome ? false : "system Chrome not installed", timeout: 120_000 },
  async () => {
    const outDir = mkdtempSync(join(tmpdir(), "sds-browser-desktop-"));
    const report = await runDesktopSmoke({ outDir });
    assert.equal(report.ok, true, JSON.stringify(report.failures, null, 2));
    assert.equal(report.viewport.width, 1440);
    assert.equal(report.viewport.height, 900);
    assert.equal(report.productionHits.length, 0);
    const forAgents = report.pages.find((page) => page.id === "for-agents");
    const recordRepeat = report.pages.find((page) => page.id === "record-repeat");
    const distributionRepair = report.pages.find((page) => page.id === "distribution-repair");
    const consumerRepeat = report.pages.find((page) => page.id === "consumer-repeat");
    assert.ok(recordRepeat, "record-repeat page missing");
    assert.ok(distributionRepair, "distribution-repair page missing");
    assert.ok(consumerRepeat, "consumer-repeat page missing");
    assert.match(recordRepeat.h1 || "", /Compare OpenAPI ops, price rows, keyed CSV, and feeds/i);
    assert.match(distributionRepair.h1 || "", /Diagnose why a listed tool cannot run from/i);
    assert.match(consumerRepeat.h1 || "", /Run local evidence jobs from a portable package/i);

    assert.equal(forAgents.linksDisplay, "flex");
    assert.notEqual(forAgents.x402LabelDisplay, "none");
    assert.equal(forAgents.contrast.narrow.linksDisplay, "none");
    const fixture = report.pages.find((page) => page.id === "fixture-example-a");
    assert.equal(fixture.h1, "Alpha");
  },
);
