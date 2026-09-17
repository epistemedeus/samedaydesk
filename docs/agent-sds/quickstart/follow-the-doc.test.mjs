import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  LLMS_SHA,
  SKILLS_SHA,
  expectSeededRejected,
  parseArgs,
  pinCheck,
  readDocs,
  runFollowTheDoc,
} from "./follow-the-doc.mjs";
import { sha256File } from "../../../tools/presence/for-agents-cold-read.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const runner = join(here, "follow-the-doc.mjs");

function spawnAsync(cmd, args, opts = {}) {
  return new Promise((resolveP, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd || repoRoot,
      env: { ...process.env, ...(opts.env || {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => {
      stdout += c.toString("utf8");
    });
    child.stderr.on("data", (c) => {
      stderr += c.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (status) => resolveP({ status: status ?? 1, stdout, stderr }));
  });
}

test("docs tree exists under docs/agent-sds/quickstart", () => {
  for (const name of [
    "README.md",
    "tutorial.md",
    "follow-the-doc.mjs",
    "fixtures/seeded-failures.json",
  ]) {
    assert.equal(existsSync(join(here, name)), true, name);
  }
});

test("committed discovery fixtures match the documented pins", () => {
  assert.equal(sha256File("agents-llms.txt"), LLMS_SHA);
  assert.equal(sha256File("skills-index.json"), SKILLS_SHA);
  const docs = readDocs();
  const pins = pinCheck(docs);
  assert.equal(pins.ok, true, pins.problems.join("; "));
});

test("full cold follow-the-doc run succeeds and rejects seeded failures", async () => {
  const result = await runFollowTheDoc({ seededFailure: "all" });
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.paid, false);
  assert.equal(result.liveMerchantExtract, false);
  assert.equal(result.checkout, false);
  assert.equal(result.publish, false);
  assert.equal(result.quadrant, "tutorial");
  assert.equal(result.tutorial.ok, true);
  assert.equal(result.tutorial.steps["cold-read"].outcome, "offline_fixture");
  assert.equal(result.tutorial.steps["route-page-change"].offerId, "sdd.page_change_offline");
  assert.equal(result.tutorial.steps["reuse-preview"].mode, "preview");
  const byId = Object.fromEntries(result.seededFailures.map((s) => [s.id, s]));
  assert.equal(byId["complete-issue-discussion"].rejected, true);
  assert.equal(byId["complete-issue-discussion"].exitCode, 2);
  assert.equal(byId["unknown-fixture"].rejected, true);
  assert.notEqual(byId["unknown-fixture"].exitCode, 0);
  assert.equal(byId["export-without-opt-in"].rejected, true);
  assert.notEqual(byId["export-without-opt-in"].exitCode, 0);
  assert.equal(existsSync("/tmp/sds-quickstart-must-not-write.json"), false);
});

test("CLI default follow-the-doc prints ok true", async () => {
  const r = await spawnAsync(process.execPath, [runner]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.surface, "sds-agent-quickstart");
  assert.equal(body.paid, false);
});

test("CLI --seeded-failure complete-issue-discussion is rejected (runner exit 0)", async () => {
  const r = await spawnAsync(process.execPath, [
    runner,
    "--seeded-failure",
    "complete-issue-discussion",
    "--json",
  ]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.tutorial, null);
  assert.equal(body.seededFailures[0].id, "complete-issue-discussion");
  assert.equal(body.seededFailures[0].rejected, true);
  assert.equal(body.seededFailures[0].exitCode, 2);
  assert.equal(body.seededFailures[0].jsonOk, false);
  assert.equal(body.seededFailures[0].selected, null);
  assert.equal(body.seededFailures[0].signal, "complete_issue_acquisition_unavailable");
  assert.deepEqual(body.seededFailures[0].warnings, ["complete_issue_acquisition_unavailable"]);
});

test("CLI unknown seeded-failure is refused without claiming ok", async () => {
  const r = await spawnAsync(process.execPath, [
    runner,
    "--seeded-failure",
    "not-a-real-id",
    "--json",
  ]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.code, "unknown-seeded-failure");
  assert.equal(body.tutorial, null);
});

test("CLI payment and checkout flags are refused", async () => {
  for (const flag of ["--pay", "--checkout", "--publish", "--live"]) {
    const r = await spawnAsync(process.execPath, [runner, flag]);
    assert.equal(r.status, 1, flag + r.stdout + r.stderr);
    const body = JSON.parse(r.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.code, "payment-forbidden");
  }
});

test("seeded expect rejects a zero exit that the fixture forbids", () => {
  const fixture = JSON.parse(readFileSync(join(here, "fixtures/seeded-failures.json"), "utf8"));
  const spec = fixture.failures.find((f) => f.id === "complete-issue-discussion");
  const accepted = expectSeededRejected(
    spec,
    { status: 0, stdout: JSON.stringify({ ok: true, selected: { offerId: "sdd.paid_html_extract" } }), stderr: "" },
    { json: { ok: true, selected: { offerId: "sdd.paid_html_extract" } } },
  );
  assert.equal(accepted, false);
  const refused = expectSeededRejected(
    spec,
    {
      status: 2,
      stdout: JSON.stringify({ ok: false, selected: null, paid: false, warnings: ["complete_issue_acquisition_unavailable"] }),
      stderr: "",
    },
  );
  assert.equal(refused, true);
});

test("parseArgs refuses unknown flags", () => {
  assert.throws(() => parseArgs(["--wallet"]), /unknown flag/);
});
