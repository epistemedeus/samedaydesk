import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  decide,
  inspectCheckout,
  inspectExistingReceipts,
  inspectPr18,
  inspectPr18Fixtures,
} from "./replay-pr18-disposition.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "replay-pr18-disposition.mjs");
const fixture = join(here, "fixtures/pr18-live-probe.json");

test("vendored PR18 sources show an in-memory Map and unread req.listing", () => {
  const pr18 = inspectPr18Fixtures();
  assert.equal(pr18.present, true);
  assert.equal(pr18.inMemoryStore, true);
  assert.equal(pr18.runtimeImportCount, 0);
  assert.equal(pr18.listingAssigned, true);
  assert.equal(pr18.listingReadCount, 0);
  assert.equal(pr18.listingUnread, true);
  assert.ok(pr18.testOnlyImportCount >= 4, pr18.testOnlyImportCount);
  assert.match(pr18.ref, /9878240b|vendored/);
});

test("inspectPr18 uses vendored fixtures when the git ref is absent", () => {
  const pr18 = inspectPr18("origin/gb07-per-surface-resource-aliases-missing");
  assert.equal(pr18.present, true);
  assert.equal(pr18.inMemoryStore, true);
  assert.equal(pr18.listingUnread, true);
});

test("close depends on receipt disconnect and unread listing, not live 404", () => {
  const checkout = inspectCheckout();
  const pr18 = inspectPr18Fixtures();
  const existingReceipts = inspectExistingReceipts();
  const live200 = {
    "listings-root": { role: "alias-root", status: 200, jsonCatalog: false },
    "listings-bazaar-mcp": { role: "alias-route", status: 200, jsonCatalog: false },
    "listings-mcp-registry-mcp": { role: "alias-route", status: 200, jsonCatalog: false },
    "agents-listings-root": { role: "alias-root", status: 200, jsonCatalog: false },
    "apex-mcp": { role: "existing-canonical", status: 200 },
    "apex-scan": { role: "existing-canonical", status: 200 },
  };
  const disposition = decide(live200, checkout, pr18, existingReceipts);
  assert.equal(disposition.close, true);
  assert.equal(disposition.recommendation, "close");
  assert.equal(disposition.receiptDisconnected, true);
  assert.equal(disposition.listingUnread, true);
  assert.equal(disposition.aliasRoot404, false);
});

test("PR18 replay recommends close from vendored sources without a second git ref", () => {
  const evidenceDir = mkdtempSync(join(tmpdir(), "lqtrack1-pr18-"));
  try {
    const result = spawnSync(
      process.execPath,
      [cli, "--fixture", fixture, "--evidence-dir", evidenceDir],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.recommendation, "close");
    assert.equal(report.receiptDisconnected, true);
    assert.equal(report.listingUnread, true);
    const evidence = JSON.parse(readFileSync(join(evidenceDir, "pr18-disposition.json"), "utf8"));
    assert.equal(evidence.disposition.close, true);
    assert.equal(evidence.pr18.runtimeImportCount, 0);
    assert.equal(evidence.pr18.inMemoryStore, true);
    assert.equal(evidence.pr18.listingUnread, true);
    assert.match(evidence.pr18.ref, /vendored|9878240b/);
    assert.match(readFileSync(join(evidenceDir, "PR18-DISPOSITION.md"), "utf8"), /Recommendation: \*\*CLOSE\*\*/);
    assert.match(
      readFileSync(join(evidenceDir, "PR18-DISPOSITION.md"), "utf8"),
      /not required to close/,
    );
  } finally {
    rmSync(evidenceDir, { recursive: true, force: true });
  }
});
