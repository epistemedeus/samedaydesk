import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import pg from "pg";
import { quoteIdent } from "../src/config.js";
import { databaseUrl } from "./helpers.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts/opportunity-receive.mjs");

function run(extra: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, ["--import", "tsx", script], {
    cwd: root,
    env: { ...process.env, ...extra },
    encoding: "utf8",
    timeout: 120_000,
  });
}

test("receive script replays the fixture cohort and restarts on disposable Postgres", () => {
  const result = run({
    EARNED_WORK_DATABASE_URL: databaseUrl(),
    EARNED_WORK_OWNER_TOKEN: "dev-owner-token-s275",
  });
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  const summary = JSON.parse(result.stdout) as {
    roundKey: string;
    committedAtomic: string;
    remainingAtomic: string;
    discoveryRemaining: number;
    workflowRemaining: number;
    overflowStatus: number;
    overflowPaidSlot: boolean;
    overflowDoNotStartWork: boolean;
    acceptPaid: boolean;
    acceptAdapter: string;
    kernelObligations: string;
    opportunityObligations: string;
    noticeReward: string;
    repricedStatus: number;
    hostedClaimAutomation: boolean;
    productionAdmission: boolean;
  };
  assert.equal(summary.roundKey, "agent-opportunity-221400-v1");
  assert.equal(summary.productionAdmission, false);
  assert.equal(summary.hostedClaimAutomation, false);
  assert.equal(summary.committedAtomic, "250000");
  assert.equal(summary.remainingAtomic, "50000");
  assert.equal(summary.discoveryRemaining, 0);
  assert.equal(summary.workflowRemaining, 1);
  assert.equal(summary.overflowStatus, 409);
  assert.equal(summary.overflowPaidSlot, false);
  assert.equal(summary.overflowDoNotStartWork, true);
  assert.equal(summary.acceptPaid, false);
  assert.equal(summary.acceptAdapter, "null_nonpaying_v0");
  assert.equal(summary.kernelObligations, "0");
  assert.equal(summary.opportunityObligations, "1");
  assert.equal(summary.noticeReward, "0.10");
  assert.equal(summary.repricedStatus, 409);
  assert.equal(result.stdout.includes("ew_ctr_"), false);
  assert.equal(result.stdout.includes("fixture:221400"), false);
});

test("receive script refuses a production fixture before admission", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "opportunity-prod-"));
  const file = path.join(dir, "round.json");
  writeFileSync(file, JSON.stringify({ roundKey: "agent-opportunity-221400-v1", provenance: "production", productionAdmission: true }));
  const result = run({ OPPORTUNITY_ROUND_FILE: file });
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /refusing production/);
  rmSync(dir, { recursive: true, force: true });
});

test("failed receive script removes its disposable schema", async () => {
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  const schemas = async () => (await client.query<{ nspname: string }>("SELECT nspname FROM pg_namespace WHERE nspname LIKE 'opprecv_%'")).rows.map(r => r.nspname);
  const before = new Set(await schemas());
  const dir = mkdtempSync(path.join(tmpdir(), "opportunity-failure-"));
  const file = path.join(dir, "cohort.json");
  const cohort = JSON.parse(readFileSync(path.join(root, "fixtures/opportunity/agent-opportunity-221400-v1.cohort.json"), "utf8"));
  cohort.assignments[0].scope = null;
  writeFileSync(file, JSON.stringify(cohort));
  try {
    const result = run({ OPPORTUNITY_COHORT_FILE: file });
    assert.equal(result.status, 1);
    assert.equal((await schemas()).filter(s => !before.has(s)).length, 0);
  } finally {
    for (const schema of (await schemas()).filter(s => !before.has(s))) await client.query(`DROP SCHEMA ${quoteIdent(schema)} CASCADE`);
    await client.end(); rmSync(dir, { recursive: true, force: true });
  }
});
