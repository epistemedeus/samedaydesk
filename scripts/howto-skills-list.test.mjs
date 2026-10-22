/**
 * Fence extractor for docs/agent-sds/howto-skills-list.md.
 * Cold clone + Node 22 — no npm install, no network, no payment.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const howtoPath = join(root, "docs/agent-sds/howto-skills-list.md");

function bash(script, env = {}) {
  return spawnSync("bash", ["-e", "-c", script], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...env },
    maxBuffer: 4 * 1024 * 1024,
  });
}

function extractFences(md) {
  const blocks = [];
  const re = /```(\w+)\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(md))) blocks.push({ lang: m[1], body: m[2].trim() });
  return blocks;
}

function firstJson(stdout) {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  assert.ok(start >= 0 && end > start, stdout);
  return JSON.parse(stdout.slice(start, end + 1));
}

test("live extract / tools.call / skills.list curls are text, not bash", () => {
  const fences = extractFences(readFileSync(howtoPath, "utf8"));
  const bashBodies = fences.filter((f) => f.lang === "bash").map((f) => f.body).join("\n");
  const textBodies = fences.filter((f) => f.lang === "text").map((f) => f.body).join("\n");
  assert.match(textBodies, /agents\.samedaydesk\.com\/extract/);
  assert.match(textBodies, /"method":"tools\/call"/);
  assert.match(textBodies, /"method":"skills\/list"/);
  assert.doesNotMatch(bashBodies, /\bcurl\b/);
});

test("cold bash fence lists three unpaid skills and refuses empty index", () => {
  const fences = extractFences(readFileSync(howtoPath, "utf8"));
  const cold = fences.find(
    (f) => f.lang === "bash" && f.body.includes("routeJobFromFile") && f.body.includes("preferFixture"),
  );
  assert.ok(cold, "howto must have a cold bash fence");
  const r = bash(cold.body);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const json = firstJson(r.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.paid, false);
  assert.equal(json.discoveryOutcome, "offline_fixture");
  assert.deepEqual(json.skillNames, ["web-extract", "page-change", "explicit-record"]);
  assert.equal(json.skillCount, 3);
  assert.equal(json.pageChangeOffer, "sdd.page_change_offline");
  assert.equal(json.noPayHtmlSelected, null);
  assert.equal(json.noPayHtmlReason, "constraint_no_payment");
  assert.equal(json.completeIssueSelected, null);
  assert.equal(json.completeIssueWarning, "complete_issue_acquisition_unavailable");
  assert.equal(json.extractAttempted, false);
  assert.equal(json.toolsCalled, false);
  assert.equal(json.mcpSkillsListPosted, false);
  assert.equal(json.neoKernelVendor, false);
  assert.equal(json.unknownFixtureRefused, "unknown_fixture");
  assert.equal(json.emptySkillsIndexRefused, "invalid_skills_index");
  assert.equal(json.skillsSha256, "a8723e38d43dac865a90392452978125c91a0e1bb58a5ff33268ba2cd4375564");
});

test("seeded bash fence under set -e still prints seeded_exit:1", () => {
  const fences = extractFences(readFileSync(howtoPath, "utf8"));
  const seeded = fences.find((f) => f.lang === "bash" && f.body.includes("SDS_HOWTO_SEED"));
  assert.ok(seeded, "howto must have a seeded bash fence");
  const r = bash(seeded.body);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /seeded_exit:1/);
  const json = firstJson(r.stdout);
  assert.equal(json.ok, false);
  assert.equal(json.rejected, true);
  assert.equal(json.code, "SILENT_EMPTY");
  assert.equal(json.neverPostedExtract, true);
  assert.equal(json.paymentAttempted, false);
  assert.deepEqual(json.listed, []);
  assert.match(r.stderr, /empty skills array is not a successful SDS skills list/);
});

test("named seeds refuse without paying and unknown seed is fail-closed", () => {
  const fences = extractFences(readFileSync(howtoPath, "utf8"));
  const seeded = fences.find((f) => f.lang === "bash" && f.body.includes("SDS_HOWTO_SEED"));
  const cases = [
    ["missing-skill", "MISSING_SKILL"],
    ["paid-extract", "PAID_EXTRACT_REFUSE"],
    ["wellknown-as-payment", "PAID_EXTRACT_REFUSE"],
    ["stripe-path", "STRIPE_PATH_REFUSE"],
    ["not-a-real-id", "UNKNOWN_SEED"],
  ];
  for (const [seed, code] of cases) {
    const r = bash(seeded.body, { SDS_HOWTO_SEED: seed });
    assert.equal(r.status, 0, `${seed}: ${r.stderr || r.stdout}`);
    assert.match(r.stdout, /seeded_exit:1/, seed);
    const json = firstJson(r.stdout);
    assert.equal(json.ok, false, seed);
    assert.equal(json.code, code, seed);
    assert.equal(json.paid, false, seed);
    assert.equal(json.paymentAttempted, false, seed);
  }
});

test("complete-issue fence under set -e still prints complete_issue_exit:2", () => {
  const fences = extractFences(readFileSync(howtoPath, "utf8"));
  const block = fences.find(
    (f) =>
      f.lang === "bash" &&
      f.body.includes("complete-issue-discussion.job.json") &&
      !f.body.includes("preferFixture") &&
      !f.body.includes("page-change-evidence"),
  );
  assert.ok(block, "howto must have a complete-issue seeded fence");
  const r = bash(block.body);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /complete_issue_exit:2/);
  const json = firstJson(r.stdout);
  assert.equal(json.ok, false);
  assert.equal(json.selected, null);
  assert.equal(json.paid, false);
  assert.equal(json.executionAuthorized, false);
  assert.ok(json.warnings.includes("complete_issue_acquisition_unavailable"));
});

test("unknown-fixture fence under set -e still prints unknown_fixture_exit:1", () => {
  const fences = extractFences(readFileSync(howtoPath, "utf8"));
  const block = fences.find(
    (f) => f.lang === "bash" && f.body.includes("unknown_fixture_exit"),
  );
  assert.ok(block, "howto must have an unknown-fixture fence");
  const r = bash(block.body);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /unknown_fixture_exit:1/);
  assert.match(r.stderr, /unknown_fixture/);
  assert.doesNotMatch(r.stderr, /at sha256File/);
});
