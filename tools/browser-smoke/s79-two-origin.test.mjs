import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { findChrome } from "./lib.mjs";
import { runS79TwoOrigin } from "./s79-two-origin.mjs";

const chrome = findChrome();

test("lockfile still has no Playwright or Puppeteer for the S79 two-origin gate", async () => {
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
  "two loopback origins: observatory + routing/acquisition at Chromium 1280 and 390",
  { skip: chrome ? false : "system Chrome not installed", timeout: 180_000 },
  async () => {
    const outDir = mkdtempSync(join(tmpdir(), "s79-two-origin-"));
    const report = await runS79TwoOrigin({ outDir });
    assert.equal(report.ok, true, JSON.stringify(report.failures, null, 2));
    assert.equal(report.productionHits.length, 0);
    assert.equal(report.nonLoopback.length, 0);
    const origins = new Set(report.pages.map((page) => new URL(page.url).origin));
    assert.equal(origins.size, 2);
    const observatory = report.pages.filter((page) => page.id === "observatory-page");
    const routing = report.pages.filter((page) => page.id === "routing-complete-issue");
    const acquisition = report.pages.filter((page) => page.id === "offline-acquisition");
    const forAgents = report.pages.filter((page) => page.id === "for-agents");
    assert.equal(observatory.length, 2);
    assert.equal(routing.length, 2);
    assert.equal(acquisition.length, 2);
    assert.ok(observatory.some((page) => page.innerWidth === 1280));
    assert.ok(observatory.some((page) => page.innerWidth === 390));
    assert.ok(routing.some((page) => page.innerWidth === 1280));
    assert.ok(routing.some((page) => page.innerWidth === 390));
    assert.ok(forAgents.some((page) => page.innerWidth === 1280));
    assert.ok(forAgents.some((page) => page.innerWidth === 390));
    assert.notEqual(new URL(observatory[0].url).origin, new URL(forAgents[0].url).origin);
  },
);
