import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "replay-pr18-disposition.mjs");
const fixture = join(here, "fixtures/pr18-live-probe.json");

test("PR18 replay recommends close from the recorded 404 / disconnect", () => {
  const evidenceDir = mkdtempSync(join(tmpdir(), "lqtrack1-pr18-"));
  try {
    const result = spawnSync(
      process.execPath,
      [cli, "--fixture", fixture, "--evidence-dir", evidenceDir],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.recommendation, "close");
    assert.equal(report.aliasRoot404, true);
    assert.equal(report.receiptDisconnected, true);
    const evidence = JSON.parse(readFileSync(join(evidenceDir, "pr18-disposition.json"), "utf8"));
    assert.equal(evidence.disposition.close, true);
    assert.equal(evidence.http.probes["listings-root"].status, 404);
    assert.equal(evidence.http.probes["listings-bazaar-mcp"].status, 404);
    assert.equal(evidence.pr18.runtimeImportCount, 0);
    assert.equal(evidence.pr18.inMemoryStore, true);
    assert.match(readFileSync(join(evidenceDir, "PR18-DISPOSITION.md"), "utf8"), /Recommendation: \*\*CLOSE\*\*/);
  } finally {
    rmSync(evidenceDir, { recursive: true, force: true });
  }
});
