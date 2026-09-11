import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { DEFAULT_CORPUS, OWNED_DIR, REPO_ROOT, WRAPPER_CLI, enginePin } from "../lib/pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "../bin/corpus.mjs");

function runCli(argv, timeoutMs = 180_000) {
  return spawnSync(process.execPath, [cli, ...argv], {
    encoding: "utf8",
    cwd: REPO_ROOT,
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
}

describe("literal caller corpus journey", { timeout: 180_000 }, () => {
  it("wrapper CLI and archive pin exist (missing deps are incomplete, not skip)", () => {
    assert.equal(existsSync(WRAPPER_CLI), true, "PR52 wrapper CLI missing");
    const pin = enginePin();
    assert.equal(pin.sha, "aeef964fa188443078958d9d6d393afae1d542ee");
    assert.match(pin.archiveSha256, /^[0-9a-f]{64}$/);
    assert.equal(typeof pin.archiveBytes, "number");
    assert.ok(pin.archiveBytes > 0);
  });

  it("validate → run → compare on independently valid caller files", () => {
    const outDir = mkdtempSync(join(tmpdir(), "w5-m11-journey-"));
    const validated = runCli(["validate", "--corpus", DEFAULT_CORPUS]);
    assert.equal(validated.status, 0, validated.stderr + validated.stdout);
    const listed = JSON.parse(validated.stdout);
    assert.equal(listed.ok, true);
    assert.equal(listed.cases.length, 4);
    assert.ok(listed.cases.every((c) => c.independentlyValidCaller === true));

    const ran = runCli(["run", "--corpus", DEFAULT_CORPUS, "--out-dir", outDir]);
    assert.equal(ran.status, 0, ran.stderr + ran.stdout);
    const report = JSON.parse(ran.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.sold, false);
    assert.equal(report.purchaseAuthority, false);
    assert.equal(report.enginePin.sha, enginePin().sha);

    const raise = report.results.find((r) => r.id === "ops-desk-rate-raise");
    const vision = report.results.find((r) => r.id === "vision-unit-shift");
    const stable = report.results.find((r) => r.id === "ops-stable-rates");
    const harbor = report.results.find((r) => r.id === "harbor-feed-delta");
    assert.equal(raise.analysis, "delivered");
    assert.equal(raise.sample, false);
    assert.equal(raise.domain.status, "actionable");
    assert.ok(raise.domain.fieldKeys.includes("ops-llm-input"));
    assert.equal(vision.analysis, "delivered");
    assert.ok(vision.domain.actionKinds.includes("normalize-unit-before-budgeting"));
    assert.equal(stable.analysis, "no-change");
    assert.equal(stable.domain.status, "informational");
    assert.ok(stable.domain.actionKinds.includes("no-budget-delta"));
    assert.equal(harbor.analysis, "delivered");
    assert.ok(harbor.domain.eventKeys.some((k) => String(k).includes("harbor")));
    assert.equal(existsSync(join(outDir, "ops-desk-rate-raise", "budget-impact.json")), true);
    assert.equal(existsSync(join(outDir, "harbor-feed-delta", "agenda.json")), true);

    const compared = runCli([
      "compare",
      "--corpus",
      DEFAULT_CORPUS,
      "--a",
      "ops-desk-rate-raise",
      "--b",
      "vision-unit-shift",
    ]);
    assert.equal(compared.status, 0, compared.stderr + compared.stdout);
    const diff = JSON.parse(compared.stdout);
    assert.equal(diff.domain.comparable, true);
    assert.equal(diff.domain.meaningful, true);
    assert.notDeepEqual(raise.domain.fieldKeys, vision.domain.fieldKeys);

    const stableCmp = JSON.parse(
      runCli(["compare", "--corpus", DEFAULT_CORPUS, "--a", "ops-desk-rate-raise", "--b", "ops-stable-rates"]).stdout,
    );
    assert.equal(stableCmp.domain.meaningful, true);
    assert.equal(stableCmp.a.analysis, "delivered");
    assert.equal(stableCmp.b.analysis, "no-change");
  });

  it("contract command publishes the tested PR52 pin", () => {
    const r = runCli(["contract"]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const body = JSON.parse(r.stdout);
    assert.equal(body.contract.schema, "samedaydesk.caller-example-corpus.v1");
    assert.equal(body.enginePin.wrapperCli, "server/paid-useful-jobs/bin/cli.mjs");
    const file = JSON.parse(readFileSync(join(OWNED_DIR, "contract/samedaydesk.caller-example-corpus.v1.json"), "utf8"));
    assert.equal(file.engine.testedImplementation.sha, enginePin().sha);
  });
});
