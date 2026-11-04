import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { verifyAssets } from "../src/pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const repo = join(root, "..", "..");
const bin = join(root, "bin", "workflow.mjs");
const fixtures = join(root, "fixtures");
const clock = "2026-11-04T22:00:00.000Z";

let tracer;

test.before(() => {
  tracer = join(tmpdir(), `n4-trace-exec-${process.pid}`);
  execFileSync("gcc", ["-O2", "-o", tracer, join(root, "observer", "trace-exec.c")], {
    stdio: "pipe",
  });
});

function read(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function workflow(args, env = {}) {
  return spawnSync(process.execPath, [bin, ...args], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function install(state) {
  const ran = workflow(["install", "--state", state, "--clock", clock]);
  assert.equal(ran.status, 0, ran.stderr || ran.stdout);
  return JSON.parse(ran.stdout);
}

function runCase(state, input, out, log) {
  const args = [process.execPath, bin, "run", "--state", state, "--input", input, "--out", out];
  const ran = log
    ? spawnSync(tracer, [log, "--", ...args], { cwd: repo, encoding: "utf8" })
    : spawnSync(args[0], args.slice(1), { cwd: repo, encoding: "utf8" });
  let result = null;
  const resultPath = join(out, "result.json");
  if (existsSync(resultPath)) result = read(resultPath);
  return { ran, result, log: log && existsSync(log) ? readFileSync(log, "utf8") : "" };
}

function workdir() {
  return mkdtempSync(join(tmpdir(), "n4-wd-"));
}

function caseFile(dir, patch = {}) {
  const base = read(join(fixtures, "case.json"));
  const doc = {
    ...base,
    pageJob: join(fixtures, "page-job.json"),
    beforeWork: join(fixtures, "before-work.json"),
    readerRecord: join(fixtures, "reader-record.json"),
    ghostPosts: join(fixtures, "ghost-posts.json"),
    sourceChange: {
      ...base.sourceChange,
      prior: join(fixtures, "prior.json"),
      capture: join(fixtures, "capture.json"),
    },
    ...patch,
  };
  if (patch.sourceChange) {
    doc.sourceChange = {
      ...base.sourceChange,
      prior: join(fixtures, "prior.json"),
      capture: join(fixtures, "capture.json"),
      ...patch.sourceChange,
    };
  }
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "case.json");
  writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`);
  return path;
}

function assertQuiet(log) {
  assert.equal(log.includes("source-change-alert"), false);
  assert.equal(log.includes("useful-jobs.mjs"), false);
  assert.equal(log.includes("table_check.py"), false);
}

test("admitted checker bytes match, and a drifted copy does not", () => {
  assert.equal(verifyAssets(root).ok, true);
  const dir = workdir();
  const pins = read(join(root, "PINS.json"));
  for (const item of pins.files) {
    const dest = join(dir, item.path);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(root, item.path), dest);
  }
  writeFileSync(join(dir, "PINS.json"), `${JSON.stringify(pins, null, 2)}\n`);
  assert.equal(verifyAssets(dir).ok, true);
  const target = join(dir, "assets", "dify", "table_csv.py");
  writeFileSync(target, `${readFileSync(target, "utf8")}\n`);
  const drifted = verifyAssets(dir);
  assert.equal(drifted.ok, false);
  assert.equal(drifted.mismatches[0].path, "assets/dify/table_csv.py");
});

test("install, update, and remove stay inside the state directory", () => {
  const state = workdir();
  const first = install(state);
  assert.equal(first.installed.difyStarted, false);
  assert.equal(first.installed.ghostServerStarted, false);
  assert.equal(existsSync(join(state, "kit", "useful-jobs-1.4.7", "bin", "useful-jobs.mjs")), true);

  const again = workflow(["install", "--state", state, "--clock", clock]);
  assert.equal(again.status, 3);
  assert.equal(JSON.parse(again.stdout).code, "already_installed");

  const bare = workdir();
  const missing = workflow(["update", "--state", bare, "--clock", clock]);
  assert.equal(missing.status, 3);
  assert.equal(JSON.parse(missing.stdout).code, "not_installed");

  rmSync(join(state, "kit"), { recursive: true, force: true });
  const updated = workflow(["update", "--state", state, "--clock", "2026-11-04T23:00:00.000Z"]);
  assert.equal(updated.status, 0, updated.stderr || updated.stdout);
  const body = JSON.parse(updated.stdout);
  assert.equal(body.installed.installedAt, clock);
  assert.equal(body.installed.updatedAt, "2026-11-04T23:00:00.000Z");
  assert.equal(existsSync(join(state, "kit", "useful-jobs-1.4.7", "bin", "useful-jobs.mjs")), true);

  const removed = workflow(["remove", "--state", state]);
  assert.equal(removed.status, 0);
  assert.equal(JSON.parse(removed.stdout).removed, true);
  assert.equal(existsSync(state), false);
  assert.equal(existsSync(join(root, "assets", "dify", "table_csv.py")), true);
  const second = workflow(["remove", "--state", state]);
  assert.equal(second.status, 0);
  assert.equal(JSON.parse(second.stdout).removed, false);

  const out = join(workdir(), "out");
  const ran = runCase(state, join(fixtures, "case.json"), out, null);
  assert.equal(ran.ran.status, 0);
  assert.equal(ran.result.outcome, "no-fit");
  assert.equal(ran.result.reason, "not_installed");
  assert.equal(ran.result.directRoute.executed, false);
  assert.equal(ran.result.directRoute.argv.includes("install"), true);
});

test("a non-fitting input returns one direct route and starts no tool", () => {
  const state = workdir();
  install(state);
  const dir = workdir();

  const unknown = caseFile(dir, { jobId: "not-a-maintained-job" });
  const unknownRun = runCase(state, unknown, join(dir, "unknown"), join(dir, "unknown.log"));
  assert.equal(unknownRun.result.outcome, "no-fit");
  assert.equal(unknownRun.result.reason, "unknown_need");
  assert.equal(unknownRun.result.directRoute.selected, false);
  assert.equal(unknownRun.result.directRoute.argv, null);
  assertQuiet(unknownRun.log);

  const live = join(dir, "live.json");
  writeFileSync(live, `${JSON.stringify({ schema: "n4.workflow-distribution.case.v1", fetch: "https://example.com/catalog/harbor-light/" })}\n`);
  const liveRun = runCase(state, live, join(dir, "live"), join(dir, "live.log"));
  assert.equal(liveRun.result.reason, "live_request");
  assert.equal(liveRun.result.directRoute.selected, true);
  assert.equal(liveRun.result.directRoute.executed, false);
  assert.equal(liveRun.result.directRoute.argv[1], "src/direct_csv.py");
  assert.match(liveRun.result.directRoute.note, /did not run it/);
  assertQuiet(liveRun.log);

  const mixed = join(dir, "mixed.json");
  writeFileSync(mixed, `${JSON.stringify({ fetch: "https://example.com/catalog/harbor-light/", contentApi: "https://example.com" })}\n`);
  const mixedRun = runCase(state, mixed, join(dir, "mixed"), join(dir, "mixed.log"));
  assert.equal(mixedRun.result.reason, "mixed_live_request");
  assert.equal(mixedRun.result.directRoute.argv, null);
  assertQuiet(mixedRun.log);

  const installDify = join(dir, "install-dify.json");
  writeFileSync(installDify, `${JSON.stringify({ installDify: true })}\n`);
  const installRun = runCase(state, installDify, join(dir, "install-dify"), join(dir, "install-dify.log"));
  assert.equal(installRun.result.reason, "live_request");
  assert.match(installRun.result.directRoute.note, /installer was not selected/);
  assertQuiet(installRun.log);

  const ghost = join(dir, "ghost.json");
  writeFileSync(ghost, `${JSON.stringify({ contentApi: "https://example.com" })}\n`);
  const ghostRun = runCase(state, ghost, join(dir, "ghost-live"), join(dir, "ghost-live.log"));
  assert.equal(ghostRun.result.directRoute.argv.at(-1), "job/bin/demo.mjs");
  assert.match(ghostRun.result.directRoute.note, /native-install/);
  assertQuiet(ghostRun.log);

  const secret = "synthetic-refused-secret";
  const privateCase = caseFile(join(dir, "private-src"), { password: secret });
  const privateRun = runCase(state, privateCase, join(dir, "private"), join(dir, "private.log"));
  assert.equal(privateRun.result.outcome, "rejected");
  assert.equal(privateRun.result.reason, "private_field");
  assert.equal(privateRun.result.privateKey, "password");
  assert.equal(JSON.stringify(privateRun.result).includes(secret), false);
  assertQuiet(privateRun.log);

  const opted = caseFile(join(dir, "opt-src"), { optIn: false });
  const optedRun = runCase(state, opted, join(dir, "opt"), join(dir, "opt.log"));
  assert.equal(optedRun.result.reason, "opt_in_required");
  assert.equal(optedRun.result.directRoute.argv[2], "--recipe");
  assert.equal(optedRun.result.directRoute.argv[3], "source-change-alert");
  assert.equal(optedRun.result.directRoute.executed, false);
  assertQuiet(optedRun.log);

  const captureLink = join(dir, "capture-link.json");
  symlinkSync(join(fixtures, "capture.json"), captureLink);
  const linked = caseFile(join(dir, "link-src"), { sourceChange: { capture: captureLink } });
  const linkRun = runCase(state, linked, join(dir, "link"), join(dir, "link.log"));
  assert.equal(linkRun.result.reason, "symlink");
  assertQuiet(linkRun.log);

  const other = read(join(fixtures, "before-work.json"));
  other.recipeId = "not-source-change-alert";
  const otherPath = join(dir, "other-before.json");
  writeFileSync(otherPath, `${JSON.stringify(other, null, 2)}\n`);
  const otherCase = caseFile(join(dir, "other-src"), { beforeWork: otherPath });
  const otherRun = runCase(state, otherCase, join(dir, "other"), join(dir, "other.log"));
  assert.equal(otherRun.result.reason, "input_not_before_work");
  assert.equal(otherRun.result.directRoute.executed, false);
  assert.equal(otherRun.result.directRoute.argv[2], "decide-or-reuse");
  assertQuiet(otherRun.log);

  const broken = join(dir, "broken.json");
  writeFileSync(broken, "{");
  const brokenRun = runCase(state, broken, join(dir, "broken"), join(dir, "broken.log"));
  assert.equal(brokenRun.result.reason, "unreadable_input");
  assert.equal(brokenRun.result.directRoute.selected, false);
  assertQuiet(brokenRun.log);
});

test("a fitting case delivers a bound decision, and the same manifest does not spawn the producer again", () => {
  const state = workdir();
  install(state);
  const dir = workdir();
  const input = caseFile(dir);
  const first = runCase(state, input, join(dir, "out1"), join(dir, "produce.log"));
  assert.equal(first.ran.status, 0, `${first.ran.stdout}\n${first.ran.stderr}`);
  assert.equal(first.result.outcome, "delivered", JSON.stringify(first.result.reuse));
  assert.equal(first.result.producerInvoked, true);
  assert.equal(first.result.reuse.verdict, "bound");
  assert.equal(first.result.reuse.outcome, "unchanged");
  assert.equal(first.result.reuse.producerInvoked, true);
  assert.equal(first.result.reuse.liveMetric.distinctLaterAcceptedTasksTakingReuse, null);
  assert.equal(first.result.reuse.liveMetric.recomputeCostAvoidedNetOfUpkeep, "costs_unknown");
  assert.equal(first.result.native.ok, true, JSON.stringify(first.result.native));
  assert.equal(first.result.native.report.fresh, false);
  assert.equal(first.result.native.report.paymentImpliesUsefulOutput, false);
  assert.equal(first.result.native.report.semantic, 0);
  assert.equal(first.result.table.status, "ok");
  assert.match(first.result.table.csv, /Bolt/);
  assert.equal(first.result.table.difyStarted, false);
  assert.equal(first.result.table.checker, "h64314.table_csv.v1");
  assert.equal(first.result.catalog.ghostServerStarted, false);
  assert.equal(first.result.catalog.writes, 1);
  assert.deepEqual(
    first.result.catalog.decisions.map((item) => item.decision).sort(),
    ["applied", "ignored"],
  );
  assert.equal(first.result.catalog.rows.some((row) => row.slug === "members-desk"), false);
  assert.equal(JSON.stringify(first.result).includes("<p>"), false);
  assert.equal(first.result.transfer.sent, false);
  assert.equal(first.result.transfer.artifact, "bound-observation.json");
  assert.equal(JSON.stringify(first.result.transfer.command).includes("/tmp/"), false);
  assert.match(first.log, /source-change-alert/);
  assert.match(first.log, /useful-jobs\.mjs/);
  assert.match(first.log, /table_check\.py/);

  const observation = readFileSync(join(dir, "out1", "bound-observation.json"), "utf8");
  assert.equal(observation.includes("/tmp/"), false);
  assert.equal(observation.includes("password"), false);
  assert.equal(observation.includes("charged"), false);
  const produced = read(join(dir, "out1", "producer-result.json"));
  assert.equal(produced.outcome, "unchanged");
  assert.equal(JSON.stringify(produced).includes("/tmp/"), false);

  rmSync(join(state, "kit"), { recursive: true, force: true });
  const updated = workflow(["update", "--state", state, "--clock", "2026-11-04T23:00:00.000Z"]);
  assert.equal(updated.status, 0, updated.stderr || updated.stdout);
  assert.equal(existsSync(join(state, "catalog.json")), true);

  const saved = join(dir, "out1", "bound-observation.json");
  const secondInput = caseFile(join(dir, "second"), { savedDecision: saved });
  const second = runCase(state, secondInput, join(dir, "out2"), join(dir, "reuse.log"));
  assert.equal(second.ran.status, 0, `${second.ran.stdout}\n${second.ran.stderr}`);
  assert.equal(second.result.outcome, "delivered");
  assert.equal(second.result.producerInvoked, false);
  assert.equal(second.result.reuse.verdict, "reuse");
  assert.equal(second.result.reuse.outcome, "unchanged");
  assert.equal(second.result.reuse.producerInvoked, false);
  assert.equal(second.result.reuse.statement, first.result.reuse.statement);
  assert.equal(second.result.catalog.writes, 0);
  assert.equal(second.result.catalog.decisions.some((item) => item.decision === "unchanged"), true);
  assert.equal(existsSync(join(dir, "out2", "producer-result.json")), false);
  assert.equal(second.result.transfer.sent, false);
  assert.match(second.log, /useful-jobs\.mjs/);
  assert.match(second.log, /table_check\.py/);
  assert.match(second.log, /result-reuse\/cli\.mjs/);
  assert.equal(second.log.includes("source-change-alert"), false);
  assert.equal(second.result.reuse.liveMetric.distinctLaterAcceptedTasksTakingReuse, null);
  assert.equal(second.result.cannotEstablish.includes("a distinct later accepted task took this reuse"), true);
});

test("a changed capture is bound as changed, and a stale prior is withheld", () => {
  const state = workdir();
  install(state);
  const dir = workdir();
  const before = read(join(fixtures, "before-work.json"));
  before.capture = read(join(fixtures, "capture-changed.json"));
  const beforePath = join(dir, "before-work.json");
  writeFileSync(beforePath, `${JSON.stringify(before, null, 2)}\n`);
  const changedInput = caseFile(dir, {
    beforeWork: beforePath,
    sourceChange: { capture: join(fixtures, "capture-changed.json") },
  });
  const changed = runCase(state, changedInput, join(dir, "changed"), join(dir, "changed.log"));
  assert.equal(changed.result.outcome, "delivered", JSON.stringify(changed.result.reuse));
  assert.equal(changed.result.reuse.outcome, "changed");
  assert.equal(changed.result.reuse.verdict, "bound");
  assert.equal(changed.result.producerInvoked, true);
  assert.match(changed.log, /source-change-alert/);
  assert.equal(changed.result.catalog.writes, 1);
  assert.equal(changed.result.catalog.rows.length, 1);

  const staleInput = caseFile(join(dir, "stale-src"), { clock: "2026-09-20T12:00:00.000Z" });
  const stale = runCase(state, staleInput, join(dir, "stale"), join(dir, "stale.log"));
  assert.equal(stale.result.outcome, "withheld", JSON.stringify(stale.result.reuse));
  assert.equal(stale.result.reuse.outcome, "stale_baseline");
  assert.equal(stale.result.reuse.recovery, "refresh_baseline");
  assert.equal(stale.result.producerInvoked, true);
  assert.equal(existsSync(join(dir, "stale", "bound-observation.json")), false);
  assert.equal(stale.result.transfer.artifact, null);
  assert.equal(stale.result.transfer.sent, false);
  assert.equal(stale.result.catalog.writes, 0);
  assert.match(stale.log, /source-change-alert/);
});

test("page two and a spanned table stay useful without a reader, and withdrawal recomputes", () => {
  const state = workdir();
  install(state);
  const dir = workdir();
  const pageInput = caseFile(dir, { readerPage: 2 });
  const page = runCase(state, pageInput, join(dir, "page"), join(dir, "page.log"));
  assert.equal(page.result.outcome, "delivered");
  assert.equal(page.result.table.status, "unsupported");
  assert.equal(page.result.table.csv, "");
  assert.equal(page.result.table.fitting, false);
  assert.equal(page.log.includes("reader_boundary"), false);
  assert.equal(page.result.table.difyStarted, false);

  const spanInput = caseFile(join(dir, "span-src"), { readerRecord: join(fixtures, "reader-spans.json") });
  const span = runCase(state, spanInput, join(dir, "span"), join(dir, "span.log"));
  assert.equal(span.result.table.status, "unsupported");
  assert.equal(span.result.table.csv, "");
  assert.match(span.result.table.handoff, /combined spans/);
  assert.equal(span.result.outcome, "delivered");

  const saved = join(dir, "page", "bound-observation.json");
  const withdrawn = caseFile(join(dir, "withdraw-src"), {
    optIn: false,
    optInWithdrawn: true,
    savedDecision: saved,
  });
  const again = runCase(state, withdrawn, join(dir, "withdraw"), join(dir, "withdraw.log"));
  assert.equal(again.result.reuse.verdict, "bound", JSON.stringify(again.result.reuse));
  assert.equal(again.result.reuse.verdict === "reuse", false);
  assert.equal(again.result.producerInvoked, true);
  assert.match(again.log, /source-change-alert/);
  assert.equal(again.result.transfer.sent, false);
});
