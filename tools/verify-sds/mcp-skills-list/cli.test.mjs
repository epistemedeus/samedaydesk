import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { SKILL_NAMES } from "./lib/catalog.mjs";
import { listSkills, postMcp, resolveMcpUrl } from "./lib/client.mjs";
import { startFixtureServer } from "./lib/fixture-server.mjs";
import { loadExpectedSkills, loadPresenceIndex, presenceNames } from "./lib/skills.mjs";
import { REPO_ROOT } from "./lib/paths.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const cli = join(here, "cli.mjs");
const harness = join(here, "run-harness.mjs");

function run(args, timeout = 30_000) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout,
    env: process.env,
  });
  let json = null;
  try {
    json = JSON.parse(result.stdout.trim().split("\n").at(-1));
  } catch {
    json = null;
  }
  return { ...result, json };
}

test("cold skills/list exit 0 against loopback fixture", () => {
  const result = run(["skills/list", "--json"]);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.command, "skills/list");
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.boundary.toolsCalled, false);
  assert.deepEqual(result.json.result.names, [...SKILL_NAMES]);
  assert.equal(result.json.result.listedBeforeCall, true);
  assert.equal(result.json.result.protocol, "2024-11-05");
  assert.equal(result.json.result.extension, "io.modelcontextprotocol/skills");
  const expected = loadExpectedSkills();
  for (const file of expected) {
    const row = result.json.result.skills.find((s) => s.name === file.name);
    assert.ok(row, file.name);
    assert.equal(row.uri, file.uri);
    assert.equal(row.digest, file.digest);
    assert.equal(row.size, file.size);
  }
});

test("tools/call refuse is non-zero; toolsCalled false; never pays", () => {
  const result = run(["tools/call", "generate_complete_fix_pack", "--json"]);
  assert.notEqual(result.status, 0, result.stderr + result.stdout);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "TOOLS_CALL_REFUSE");
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.boundary.toolsCalled, false);
  assert.equal(result.json.result.refused, true);
});

test("seeded silent-empty-success exit 1 with SILENT_EMPTY", () => {
  const result = run(["--seeded-failure", "silent-empty-success", "--json"]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "SILENT_EMPTY");
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.boundary.toolsCalled, false);
  assert.equal(result.json.result.refused, true);
});

test("seeded missing-skill exit 1 with MISSING_SKILL", () => {
  const result = run(["--seeded-failure", "missing-skill", "--json"]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "MISSING_SKILL");
  assert.equal(result.json.result.omitted, "web-extract");
  assert.equal(result.json.result.refused, true);
});

test("seeded digest-mismatch exit 1 with DIGEST_MISMATCH", () => {
  const result = run(["--seeded-failure", "digest-mismatch", "--json"]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "DIGEST_MISMATCH");
  assert.equal(result.json.result.refused, true);
});

test("seeded tools-call exit 1 with TOOLS_CALL_REFUSE", () => {
  const result = run(["--seeded-failure", "tools-call", "--json"]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "TOOLS_CALL_REFUSE");
  assert.equal(result.json.result.neverPostedCall, true);
});

test("seeded protocol-2026-07-28-only exit 1 with PROTOCOL_REFUSE", () => {
  const result = run(["--seeded-failure", "protocol-2026-07-28-only", "--json"]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "PROTOCOL_REFUSE");
  assert.equal(result.json.result.rejected, "2026-07-28-only");
  assert.equal(result.json.result.negotiated, "2024-11-05");
});

test("fixture pointer yields silent-empty refuse", () => {
  const result = run([
    "--fixture",
    "tools/verify-sds/mcp-skills-list/fixtures/seeded/silent-empty-success.json",
    "--json",
  ]);
  assert.equal(result.status, 1);
  assert.equal(result.json.error.code, "SILENT_EMPTY");
});

test("cold run-harness exit 0 (list ok + seeds refuse)", () => {
  const result = spawnSync(process.execPath, [harness], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
    env: process.env,
  });
  let json = null;
  try {
    json = JSON.parse(result.stdout.trim().split("\n").at(-1));
  } catch {
    json = null;
  }
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.result.listOk, true);
  assert.equal(json.result.seedsOk, true);
  assert.equal(json.boundary.paymentSent, false);
  assert.equal(json.boundary.toolsCalled, false);
  const seedSteps = json.result.steps.filter((s) => s.step.startsWith("seeded:"));
  assert.equal(seedSteps.length, 9);
});

test("presence skills-index names match catalog", () => {
  const presence = loadPresenceIndex(REPO_ROOT);
  assert.ok(presence);
  assert.deepEqual(presenceNames(presence), [...SKILL_NAMES]);
});

test("committed SKILL.md files do not embed payment headers", () => {
  for (const file of loadExpectedSkills()) {
    assert.equal(/PAYMENT-SIGNATURE|X-PAYMENT|buy\.stripe\.com/i.test(file.text), false, file.name);
    assert.match(file.digest, /^sha256:[0-9a-f]{64}$/);
    assert.ok(file.size > 0);
  }
});

test("cite-apex documents live URL without calling tools", () => {
  const result = run(["cite-apex", "--json"]);
  assert.equal(result.status, 0);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.boundary.toolsCalled, false);
  assert.equal(result.json.boundary.paymentSent, false);
  assert.match(result.json.result.url, /samedaydesk\.com\/mcp/);
});

test("skills-index fixture matches catalog three", () => {
  const index = JSON.parse(readFileSync(join(here, "fixtures/skills-index.json"), "utf8"));
  assert.deepEqual(index.skills, [...SKILL_NAMES]);
  assert.equal(index.protocol, "2024-11-05");
});

test("seeded payment-signature exit 1; header never sent", () => {
  const result = run(["--seeded-failure", "payment-signature", "--json"]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "PAYMENT_HEADER_REFUSE");
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.result.headerNeverSent, true);
});

test("seeded stripe-path exit 1 with STRIPE_PATH_REFUSE", () => {
  const result = run(["--seeded-failure", "stripe-path", "--json"]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "STRIPE_PATH_REFUSE");
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.boundary.toolsCalled, false);
  assert.equal(result.json.result.neverOpenedCheckout, true);
});

test("seeded method-not-found-as-success exit 1 with METHOD_NOT_FOUND", () => {
  const result = run(["--seeded-failure", "method-not-found-as-success", "--json"]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "METHOD_NOT_FOUND");
  assert.equal(result.json.result.refused, true);
  assert.equal(result.json.result.liveApexToday, "-32601");
  assert.equal(result.json.result.committedSkillsListCase, false);
  assert.equal(result.json.boundary.paymentSent, false);
});

test("seeded wellknown-as-skills-list exit 1", () => {
  const result = run(["--seeded-failure", "wellknown-as-skills-list", "--json"]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "WELLKNOWN_IS_NOT_SKILLS_LIST");
  assert.equal(result.json.result.hasDigest, false);
  assert.equal(result.json.boundary.paymentSent, false);
});

test("unknown seeded-failure is rejected", () => {
  const result = run(["--seeded-failure", "not-a-real-seed", "--json"]);
  assert.equal(result.status, 2, result.stderr + result.stdout);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "USAGE");
  assert.equal(result.json.boundary.paymentSent, false);
});

test("bare --seeded-failure does not consume --json as seed id", () => {
  const result = run(["--seeded-failure", "--json"]);
  assert.equal(result.status, 2, result.stderr + result.stdout);
  assert.equal(result.json.error.code, "USAGE");
  assert.match(result.json.error.message, /missing value for --seeded-failure/);
});

test("origin buy.stripe.com is STRIPE_PATH_REFUSE before any live POST", () => {
  const result = run([
    "skills/list",
    "--origin",
    "https://buy.stripe.com/8x24gA0xA9DF9dd13YeZ20h",
    "--json",
  ]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.error.code, "STRIPE_PATH_REFUSE");
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.result.neverOpenedCheckout, true);
});

test("origin mcp?cs= is STRIPE_PATH_REFUSE and does not rewrite query", () => {
  const result = run([
    "skills/list",
    "--origin",
    "https://samedaydesk.com/mcp?cs=cs_test_fake",
    "--json",
  ]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.error.code, "STRIPE_PATH_REFUSE");
  assert.equal(result.json.boundary.paymentSent, false);
});

test("postMcp refuses PAYMENT-SIGNATURE before any socket", () => {
  assert.throws(
    () =>
      postMcp(
        "http://127.0.0.1:1/mcp",
        { jsonrpc: "2.0", id: 1, method: "initialize" },
        { headers: { "PAYMENT-SIGNATURE": "seeded-fake-sig" } },
      ),
    (e) => e.code === "PAYMENT_HEADER_REFUSE",
  );
});

test("postMcp refuses tools/call before any socket", () => {
  assert.throws(
    () =>
      postMcp("http://127.0.0.1:1/mcp", {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "generate_complete_fix_pack" },
      }),
    (e) => e.code === "TOOLS_CALL_REFUSE",
  );
});

test("resolveMcpUrl joins /mcp without appending onto query strings", () => {
  assert.equal(resolveMcpUrl("http://127.0.0.1:9"), "http://127.0.0.1:9/mcp");
  assert.equal(resolveMcpUrl("http://127.0.0.1:9/mcp/"), "http://127.0.0.1:9/mcp");
  assert.throws(
    () => resolveMcpUrl("https://samedaydesk.com/mcp?cs=cs_test_fake"),
    (e) => e.code === "STRIPE_PATH_REFUSE",
  );
});

test("listSkills against loopback origin via resolveMcpUrl", async () => {
  const handle = await startFixtureServer();
  try {
    const url = resolveMcpUrl(handle.origin);
    assert.equal(url, handle.url);
    const session = await listSkills(url);
    assert.equal(session.initialize.status, 200);
    assert.equal(session.listed.status, 200);
    const names = session.listed.json.result.skills.map((s) => s.frontmatter.name);
    assert.deepEqual(names, [...SKILL_NAMES]);
  } finally {
    await handle.close();
  }
});
