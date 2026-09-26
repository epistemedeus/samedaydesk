import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import { packDossier, packFromPaths } from "../lib/pack.mjs";
import { classifyCheck } from "../lib/observation.mjs";
import { ERROR_CODES, F08_SHA, SDS52_SHA, WRAPPER_RECEIPT_SCHEMA } from "../lib/pins.mjs";
import { runPinChecks } from "../lib/source-status.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const repo = join(here, "../../..");
const bin = join(root, "bin/dossier.mjs");

function load(rel) {
  return JSON.parse(readFileSync(join(root, rel), "utf8"));
}

function run(args) {
  return spawnSync(process.execPath, [bin, ...args], {
    encoding: "utf8",
    cwd: repo,
  });
}

describe("Co06 observation honesty", () => {
  test("unrun optional check is never a pass or observed, even if matched is set", () => {
    const check = classifyCheck({
      id: "live-extract-http",
      ran: false,
      observed: true,
      matched: true,
      detail: "would skip",
    });
    assert.equal(check.status, "unrun");
    assert.equal(check.pass, false);
    assert.equal(check.observed, false);
  });

  test("CLI pack of catalog 402 fixture is expected, not observed", () => {
    const r = run([
      "pack",
      "--extract-unpaid",
      "tools/failed-delivery-dossier/fixtures/extract-unpaid/extract-402-contract.json",
    ]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const json = JSON.parse(r.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.sold, false);
    assert.equal(json.evidence[0].sourceKind, "extract-unpaid");
    assert.equal(json.evidence[0].observationStatus, "expected");
    assert.equal(json.evidence[0].expectedStatus, 402);
    assert.equal(json.evidence[0].observedHttpStatus, null);
    assert.equal(json.evidence[0].outcomeKind, "expected-paywall");
    assert.match(json.evidence[0].whyNotInHand, /not an observed response/i);
    assert.doesNotMatch(json.evidence[0].whyNotInHand, /^Unpaid extract HTTP 402/);
    assert.equal(json.honesty.liveExtractUnpaid.observationStatus, "unrun");
    assert.equal(json.honesty.liveExtractUnpaid.observedHttpStatus, null);
    assert.equal(json.honesty.readyForRelease, false);
    const extractCheck = json.honesty.checks.find((row) => row.id === "extract-http-402");
    assert.equal(extractCheck.status, "expected");
    assert.equal(extractCheck.observed, false);
    const live = json.honesty.checks.find((row) => row.id === "live-extract-http");
    assert.equal(live.status, "unrun");
    assert.equal(live.pass, false);
    assert.equal(live.observed, false);
    const postgres = json.honesty.checks.find((row) => row.id === "postgres");
    assert.equal(postgres.status, "unrun");
    assert.equal(postgres.pass, false);
  });

  test("claimed httpStatus 402 without capture is expected, not observed", async () => {
    const json = await packFromPaths(
      {
        "extract-unpaid": join(root, "fixtures/extract-unpaid/claimed-http-402-unobserved.json"),
      },
      { cwd: root },
    );
    assert.equal(json.ok, true);
    assert.equal(json.evidence[0].observationStatus, "expected");
    assert.equal(json.evidence[0].observedHttpStatus, null);
    assert.equal(json.evidence[0].expectedStatus, 402);
  });

  test("claimed official source without evidence is refused", () => {
    const result = packDossier({
      items: [
        {
          sourceKind: "extract-unpaid",
          body: load("fixtures/seeded-failures/official-source-without-evidence.json"),
        },
      ],
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, ERROR_CODES.OFFICIAL_SOURCE_WITHOUT_EVIDENCE);
    assert.equal(result.sold, false);
  });

  test("claimed observed HTTP without capture is refused", () => {
    const result = packDossier({
      items: [
        {
          sourceKind: "extract-unpaid",
          body: load("fixtures/seeded-failures/claimed-observed-without-capture.json"),
        },
      ],
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, ERROR_CODES.CLAIMED_OBSERVED_WITHOUT_CAPTURE);
  });

  test("local HTTP 402 capture is observed paywall and live extract stays unrun", () => {
    const captureBin = join(root, "lib/capture-extract-402-http.mjs");
    const r = spawnSync(process.execPath, [captureBin], {
      encoding: "utf8",
      cwd: repo,
      timeout: 15_000,
    });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const json = JSON.parse(r.stdout);
    assert.equal(json.capture.class, "local-runtime");
    assert.equal(json.capture.http.status, 402);
    assert.equal(json.packed.ok, true);
    assert.equal(json.packed.evidence[0].observationStatus, "observed");
    assert.equal(json.packed.evidence[0].observedHttpStatus, 402);
    assert.equal(json.packed.evidence[0].outcomeKind, "observed-paywall");
    assert.match(json.packed.evidence[0].whyNotInHand, /Observed unpaid HTTP 402/);
    assert.equal(json.packed.honesty.liveExtractUnpaid.observationStatus, "unrun");
    assert.equal(json.packed.honesty.liveExtractUnpaid.localRuntime402, true);
    const live = json.packed.honesty.checks.find((row) => row.id === "live-extract-http");
    assert.equal(live.status, "unrun");
    assert.equal(live.pass, false);
  });

  test("CLI --verify-pins observes F08 capture pin and SDS52 current pin as distinct SHAs", () => {
    const r = run(["--verify-pins"]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const json = JSON.parse(r.stdout);
    assert.equal(json.ok, true);
    const f08 = json.pinChecks.find((row) => row.id === "f08-pin-worktree");
    const sds52 = json.pinChecks.find((row) => row.id === "sds52-pin-worktree");
    assert.equal(f08.status, "observed");
    assert.equal(f08.pass, true);
    assert.equal(f08.sha, F08_SHA);
    assert.equal(f08.got, F08_SHA);
    assert.equal(sds52.status, "observed");
    assert.equal(sds52.pass, true);
    assert.equal(sds52.sha, SDS52_SHA);
    assert.equal(sds52.got, SDS52_SHA);
    assert.notEqual(F08_SHA, SDS52_SHA);
  });

  test("current SDS52 CLI sample refusal is valid analysis, not transport failure", () => {
    const pins = runPinChecks();
    const sds52 = pins.find((row) => row.id === "sds52-pin-worktree");
    assert.equal(sds52.pass, true, sds52.detail);
    const worktree = process.env.SDS52_READONLY_WORKTREE || "/tmp/ro-worktrees/sds52-aeef964f";
    const cli = join(worktree, "server/paid-useful-jobs/bin/cli.mjs");
    const r = spawnSync(
      process.execPath,
      [
        cli,
        "run",
        "vendor-budget-impact",
        "--example",
        "--funding",
        "reserved-fixture",
        "--payment",
        "server/paid-useful-jobs/fixtures/payment/reserved-fixture.json",
      ],
      { cwd: worktree, encoding: "utf8" },
    );
    assert.equal(r.status, 2, r.stderr + r.stdout);
    const body = JSON.parse(r.stdout);
    assert.equal(body.receipt.schema, WRAPPER_RECEIPT_SCHEMA);
    assert.equal(body.code, "sample-not-a-sale");
    assert.equal(body.sold, false);
    const packed = packDossier({
      items: [
        {
          sourceKind: "wrapper-receipt",
          originClass: "local-runtime",
          cli: { exitCode: r.status, argv: ["run", "vendor-budget-impact", "--example"] },
          body,
        },
      ],
    });
    assert.equal(packed.ok, true);
    assert.equal(packed.evidence[0].observationStatus, "observed");
    assert.equal(packed.evidence[0].outcomeKind, "valid-analysis");
    assert.notEqual(packed.evidence[0].outcomeKind, "transport-failure");
    assert.equal(packed.sold, false);
  });
});
