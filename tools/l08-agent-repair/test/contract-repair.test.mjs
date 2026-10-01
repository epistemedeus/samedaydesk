import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { repairContract, validateContractRepairSection, buildContractRepairHandoff } from "../lib/contract-repair.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");
const cold = join(repoRoot, "tools/l08-agent-repair/cold-client.mjs");
const fixtures = join(repoRoot, "tools/l08-agent-repair/fixtures/contract-repair");
const LEAKS = ["sk_live_L08CONTRACTSECRET", "buyer@example.test", "UNIQUEVALUEZZ", "OTHERVALUEZZ", "east", "alpha-one", "plink_"];

function runCold(args) {
  return spawnSync(process.execPath, [cold, ...args], { cwd: repoRoot, encoding: "utf8" });
}

function callerDir(name) {
  const out = mkdtempSync(join(tmpdir(), "l08-contract-"));
  const result = runCold(["contract-repair", "--in", join(fixtures, name), "--out", out]);
  return { out, result };
}

test("two cold callers receive different contract patches and run them", () => {
  const paidGet = callerDir("paid-get-object.json");
  const paidPost = callerDir("paid-post-array.json");
  try {
    assert.equal(paidGet.result.status, 0, `${paidGet.result.stdout}\n${paidGet.result.stderr}`);
    assert.equal(paidPost.result.status, 0, `${paidPost.result.stdout}\n${paidPost.result.stderr}`);
    assert.match(paidGet.result.stdout, /local-paid-get-object paid_get missing_response_schema object suggestion not-owner-applied/);
    assert.match(paidPost.result.stdout, /local-paid-post-array paid_post incorrect_response_schema array suggestion not-owner-applied/);
    assert.doesNotMatch(`${paidGet.result.stdout}\n${paidPost.result.stdout}`, /https?:\/\/|plink_|sk_live_|UNIQUEVALUEZZ/);
    for (const produced of [paidGet, paidPost]) {
      const regression = spawnSync(process.execPath, [join(produced.out, "regression.mjs")], { encoding: "utf8" });
      assert.equal(regression.status, 0, `${regression.stdout}\n${regression.stderr}`);
      assert.match(regression.stdout, /prior-mismatch/);
      const patch = JSON.parse(readFileSync(join(produced.out, "patch.json"), "utf8"));
      const blob = readFileSync(join(produced.out, "regression.json"), "utf8")
        + readFileSync(join(produced.out, "patch.json"), "utf8")
        + readFileSync(join(produced.out, "summary.json"), "utf8");
      assert.equal(patch.ownerApplied, false);
      assert.equal(patch.verifiedRepair, false);
      assert.equal(patch.disposition, "suggestion");
      assert.equal(JSON.stringify(patch.schema).includes("additionalProperties"), false);
      assert.equal(JSON.stringify(patch).includes("\"example\""), false);
      assert.equal(JSON.stringify(patch).includes("\"const\""), false);
      for (const token of LEAKS) assert.equal(blob.includes(token), false, token);
    }
    const getSummary = JSON.parse(readFileSync(join(paidGet.out, "summary.json"), "utf8"));
    const postSummary = JSON.parse(readFileSync(join(paidPost.out, "summary.json"), "utf8"));
    assert.deepEqual(getSummary.requiredPaths, ["$.price", "$.symbol"]);
    assert.deepEqual(getSummary.optionalPaths, ["$.apiKey", "$.contact", "$.venue"]);
    assert.deepEqual(postSummary.requiredPaths, ["$[].id", "$[].ok"]);
    assert.deepEqual(postSummary.optionalPaths, ["$[].note"]);
    assert.notEqual(getSummary.sourceId, postSummary.sourceId);
    assert.equal(getSummary.path, "/local/desk/quote");
    assert.equal(postSummary.path, "/local/desk/search");
  } finally {
    rmSync(paidGet.out, { recursive: true, force: true });
    rmSync(paidPost.out, { recursive: true, force: true });
  }
});

test("ambiguous contracts ask a question and bad repairs are rejected", () => {
  const limits = runCold(["contract-repair-limits"]);
  assert.equal(limits.status, 0, `${limits.stdout}\n${limits.stderr}`);
  assert.match(limits.stdout, /incomplete-one.json unresolved/);
  assert.match(limits.stdout, /conflict-types.json unresolved/);
  assert.match(limits.stdout, /null-mixed.json unresolved/);
  assert.match(limits.stdout, /one-of.json unresolved/);
  assert.match(limits.stdout, /null-pair.json suggestion type null/);
  const negative = runCold(["contract-repair-negative"]);
  assert.equal(negative.status, 1, `${negative.stdout}\n${negative.stderr}`);
  assert.match(negative.stdout, /repair_unchanged exit 1/);
  assert.match(negative.stdout, /repair_incorrect exit 1/);
  assert.match(negative.stdout, /second_wallet_refused exit 1/);
  assert.match(negative.stdout, /checkout_refused exit 1/);
  assert.match(negative.stdout, /malformed_input exit 2/);
  assert.match(negative.stdout, /oversized_input exit 2/);
  assert.match(negative.stdout, /file_oversized exit 2/);
  assert.match(negative.stdout, /secret_redacted exit 0/);
  assert.match(negative.stdout, /tampered_regression exit 1/);
  const section = buildContractRepairHandoff();
  assert.equal(validateContractRepairSection(section), null);
  const verified = structuredClone(section);
  verified.verifiedRepair = true;
  assert.equal(validateContractRepairSection(verified), "contract_repair");
});

test("a local ref to a bare object is not treated as one closed shape", () => {
  const result = repairContract({
    callerId: "local-ref",
    routeClass: "paid_get",
    method: "GET",
    path: "/local/desk/ref",
    contract: {
      kind: "openapi",
      document: {
        openapi: "3.0.3",
        paths: {
          "/local/desk/ref": {
            get: {
              responses: {
                "200": {
                  description: "OK",
                  content: { "application/json": { schema: { $ref: "#/components/schemas/Bare" } } },
                },
              },
            },
          },
        },
        components: { schemas: { Bare: { type: "object" } } },
      },
    },
    observations: [
      { symbol: "a", price: 1 },
      { symbol: "b", price: 2, venue: "z" },
    ],
  });
  assert.equal(result.exit, 0, result.error || result.question);
  assert.equal(result.summary.findingClass, "incorrect_response_schema");
  assert.equal(result.summary.regression.reason, "unconstrained");
  assert.deepEqual(result.summary.requiredPaths, ["$.price", "$.symbol"]);
  assert.deepEqual(result.summary.optionalPaths, ["$.venue"]);
  assert.equal(Object.hasOwn(result.summary.patch.schema, "additionalProperties"), false);
  assert.equal(result.summary.ownerApplied, false);
});

test("the contract repair module does not fetch or edit a seller checkout route", () => {
  const source = readFileSync(join(repoRoot, "tools/l08-agent-repair/lib/contract-repair.mjs"), "utf8");
  assert.equal(source.includes("fetch("), false);
  assert.equal(source.includes("seller-repair-checkout"), false);
  assert.equal(source.includes("git push"), false);
});
