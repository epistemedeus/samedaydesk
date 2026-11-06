import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { acquireAndRun, installConsumer, removeInstalled, runInstalled, updateInstalled } from "../src/acquire.mjs";
import { loadAllInterfaces } from "../src/manifests.mjs";
import { registerExtension } from "../src/lifecycle.mjs";
import { previewReuse, bindUsefulDecision } from "../../result-reuse/src/export.mjs";
import { SITES } from "../src/sites.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "..");
const repo = join(here, "../../..");
const sourceCommit = "c60641e8ff2b94dd704307e57f5b6fe789ba0df7";
const clock = "2026-11-06T12:00:00.000Z";
const n45 = JSON.parse(readFileSync(join(packageRoot, "fixtures/inputs/fitting-n45-page-change.json"), "utf8"));
const chat = JSON.parse(readFileSync(join(packageRoot, "fixtures/inputs/nonfitting-unrecognized-chat-task.json"), "utf8"));
const before = JSON.parse(readFileSync(join(packageRoot, "fixtures/inputs/fitting-before-work.json"), "utf8"));
const produced = JSON.parse(readFileSync(join(packageRoot, "fixtures/inputs/fitting-produced-decision.json"), "utf8"));
const inputBytes = readFileSync(join(packageRoot, "fixtures/inputs/fitting-n45-page-change.json"));

const previewOptions = {
  taskId: "n45-example-com",
  subject: "n45-example-com-result",
  sequence: 1,
  clock: "2026-09-09T08:00:00.000Z",
};

function store() {
  return mkdtempSync(join(tmpdir(), "woe-n7-"));
}

function previewJob(input = n45, extra = {}) {
  return {
    tool: "preview_reuse",
    input,
    task_id: previewOptions.taskId,
    subject: previewOptions.subject,
    sequence: previewOptions.sequence,
    clock: previewOptions.clock,
    ...extra,
  };
}

function install(consumer, site, root = store()) {
  const acquired = installConsumer({ consumer, site, store: root, sourceCommit, clock });
  assert.equal(acquired.ok, true, acquired.message);
  assert.equal(acquired.hostRuntimeInstalled, false);
  assert.equal(acquired.record.installationStatus, "source_only_not_installed");
  assert.equal(acquired.record.runtimeExecutionStatus, "not yet executed on runtime");
  assert.equal(acquired.record.sourceCommit, sourceCommit);
  assert.equal(acquired.record.site, site);
  return { root, acquired };
}

test("committed manifests for the three consumers stay prepared, not installed", () => {
  const all = loadAllInterfaces();
  assert.equal(all.ok, true, all.message);
  const kinds = Object.fromEntries(all.consumers.map((item) => [item.consumer.key, item.status.kind]));
  assert.equal(kinds.native, "native_package");
  assert.equal(kinds.mcp, "mcp_cli");
  assert.equal(kinds.review, "dify_ghost_class");
  assert.equal(Object.keys(SITES).length, 3);
  for (const key of ["native", "mcp", "review"]) {
    const text = readFileSync(join(packageRoot, "manifests", key, "interface-status.json"), "utf8");
    assert.match(text, /source_only_not_installed/);
    assert.doesNotMatch(text, /installationStatus": "installed"/);
  }
});

test("native lifecycle runs the process, keeps the source pin, and falls back after remove", () => {
  const { root } = install("native", "samedaydesk");
  const direct = previewReuse(n45, previewOptions);
  const ran = runInstalled({ consumer: "native", store: root, job: previewJob() });
  assert.equal(ran.ok, true, ran.message);
  assert.equal(ran.fitting, true);
  assert.equal(ran.executionDeclaration, "native_package_executed");
  assert.equal(ran.selectedRuntime.ran, true);
  assert.equal(ran.selectedRuntime.name, "native");
  assert.equal(ran.pid, ran.childPid);
  assert.notEqual(ran.pid, process.pid);
  assert.equal(ran.published, false);
  assert.equal(ran.installationStatus, "source_only_not_installed");
  assert.deepEqual(ran.observation, direct.observation);
  assert.equal(ran.externalInstallers.ghost, "unsupported_execution");
  assert.equal(ran.externalInstallers.n8n, "unsupported_execution");
  assert.equal(readFileSync(join(packageRoot, "fixtures/inputs/fitting-n45-page-change.json")).equals(inputBytes), true);

  const refused = runInstalled({ consumer: "native", store: root, job: previewJob(chat) });
  assert.equal(refused.ok, true);
  assert.equal(refused.fitting, false);
  assert.equal(refused.capabilityApplied, false);
  assert.equal(refused.observation, null);
  assert.equal(refused.selectedRuntime.ran, true);

  const denied = runInstalled({
    consumer: "native",
    store: root,
    job: { ...previewJob(), tool: "export_reuse" },
  });
  assert.equal(denied.ok, false);
  assert.match(denied.sdkEnvelope.sdk.message, /opt-in/);

  const updated = updateInstalled({
    consumer: "native",
    store: root,
    version: "0.1.1",
    clock: "2026-11-06T12:05:00.000Z",
  });
  assert.equal(updated.ok, true, updated.message);
  assert.equal(updated.record.version, "0.1.1");
  assert.equal(updated.record.sourceCommit, sourceCommit);
  assert.equal(updated.record.previousVersions[0].version, "0.1.0");
  assert.equal(updated.record.previousVersions[0].sourceCommit, sourceCommit);
  assert.equal(updated.record.site, "samedaydesk");
  const source = JSON.parse(readFileSync(join(root, "native/prefix/SOURCE.json"), "utf8"));
  assert.equal(source.version, "0.1.1");
  assert.equal(source.sourceCommit, sourceCommit);
  assert.equal(source.hostRuntimeInstalled, false);

  const removed = removeInstalled({ consumer: "native", store: root, clock: "2026-11-06T12:10:00.000Z" });
  assert.equal(removed.record.removed, true);
  assert.equal(existsSync(join(root, "native/prefix")), false);
  const fallback = runInstalled({ consumer: "native", store: root, job: previewJob() });
  assert.equal(fallback.executionDeclaration, "unsupported_execution");
  assert.equal(fallback.selectedRuntime.ran, false);
  assert.equal(fallback.fallback, true);
  assert.equal(typeof fallback.fallbackPid, "number");
  assert.deepEqual(fallback.observation, direct.observation);
  assert.match(fallback.usefulDirectRoute.cli, /tools\/result-reuse\/cli\.mjs/);
});

test("a JSON register without a prefix is not an installation", () => {
  const root = store();
  const registered = registerExtension({
    store: root,
    consumer: "native",
    clock,
    site: "ein-llc",
    sourceCommit,
  });
  assert.equal(registered.ok, true);
  assert.equal(existsSync(join(root, "native/prefix/SOURCE.json")), false);
  const fallback = runInstalled({ consumer: "native", store: root, job: previewJob() });
  assert.equal(fallback.executionDeclaration, "unsupported_execution");
  assert.equal(fallback.fallback, true);
  assert.equal(fallback.selectedRuntime.ran, false);
  assert.deepEqual(fallback.observation, previewReuse(n45, previewOptions).observation);
});

test("MCP/CLI speaks the tool process and refuses publication and duplicate installers", () => {
  const { root } = install("mcp", "ein-llc");
  const ran = runInstalled({ consumer: "mcp", store: root, job: previewJob() });
  assert.equal(ran.ok, true, JSON.stringify({ message: ran.message, stderr: ran.stderr }));
  assert.equal(ran.executionDeclaration, "mcp_stdio_executed");
  assert.equal(ran.selectedRuntime.name, "mcp");
  assert.equal(ran.selectedRuntime.ran, true);
  assert.equal(ran.pid, ran.childPid);
  assert.deepEqual(ran.mcp.tools, ["preview_reuse", "export_reuse", "decide_or_reuse"]);
  assert.equal(ran.published, false);
  assert.deepEqual(ran.observation, previewReuse(n45, previewOptions).observation);

  const refused = runInstalled({ consumer: "mcp", store: root, job: previewJob(chat) });
  assert.equal(refused.fitting, false);
  assert.equal(refused.observation, null);
  assert.equal(refused.selectedRuntime.ran, true);

  const bound = runInstalled({
    consumer: "mcp",
    store: root,
    job: {
      tool: "decide_or_reuse",
      input: before,
      produced,
      task_id: "source-change-example",
      subject: "source-change-example-decision",
      sequence: 1,
      clock: "2026-09-09T08:00:00.000Z",
      horizon: 168,
      opt_in: true,
    },
  });
  assert.equal(bound.ok, true, bound.message || bound.sdkEnvelope?.message);
  const direct = bindUsefulDecision(before, produced, {
    taskId: "source-change-example",
    subject: "source-change-example-decision",
    sequence: 1,
    clock: "2026-09-09T08:00:00.000Z",
    horizonHours: 168,
    optIn: true,
  });
  assert.deepEqual(bound.observation, direct.observation);

  const published = runInstalled({ consumer: "mcp", store: root, job: { ...previewJob(), publish: true } });
  assert.equal(published.ok, false);
  assert.equal(published.executionDeclaration, "unsupported_execution");
  assert.equal(published.published, false);
  assert.match(published.message, /publication/);

  for (const consumer of ["ghost", "dify", "n8n", "dify-table-csv"]) {
    const blocked = installConsumer({ consumer, site: "ein-llc", store: root, sourceCommit, clock });
    assert.equal(blocked.ok, false, consumer);
    assert.equal(blocked.executionDeclaration, "unsupported_execution");
    assert.equal(blocked.hostRuntimeInstalled, false);
  }
});

test("review drafts stay unpublished, retain history, and do not publish", () => {
  const { root } = install("review", "neomorphic-io");
  const first = runInstalled({ consumer: "review", store: root, job: previewJob() });
  assert.equal(first.ok, true, first.message);
  assert.equal(first.executionDeclaration, "review_draft_executed");
  assert.equal(first.selectedRuntime.name, "review-draft");
  assert.equal(first.pid, first.childPid);
  assert.equal(first.draft.published, false);
  assert.equal(first.draft.status, "unpublished_pending_human_review");
  const current = readFileSync(first.draft.path, "utf8");
  assert.match(current, /published: false/);
  assert.match(current, /site: neomorphic-io/);
  assert.ok(current.includes(first.observation.statement.split("\n")[0]));

  const second = runInstalled({
    consumer: "review",
    store: root,
    job: previewJob(n45, { sequence: 2 }),
  });
  assert.equal(second.ok, true, second.message);
  assert.equal(second.draft.historyCount, 1);
  assert.equal(second.draft.sequence, 2);
  const history = JSON.parse(readFileSync(join(root, "review/prefix/drafts/n45-example-com--n45-example-com-result/history.json"), "utf8"));
  assert.equal(history[0].sequence, 1);
  assert.match(history[0].retained, /sequence: 1/);
  const updatedDraft = readFileSync(second.draft.path);
  assert.match(updatedDraft.toString("utf8"), /sequence: 2/);
  assert.match(updatedDraft.toString("utf8"), /published: false/);

  const published = runInstalled({ consumer: "review", store: root, job: { ...previewJob(n45, { sequence: 2 }), publish: true } });
  assert.equal(published.ok, false);
  assert.equal(published.executionDeclaration, "unsupported_execution");
  assert.equal(published.published, false);
  assert.equal(readFileSync(second.draft.path).equals(updatedDraft), true);

  const fresh = install("review", "samedaydesk");
  const missed = runInstalled({ consumer: "review", store: fresh.root, job: previewJob(chat) });
  assert.equal(missed.fitting, false);
  assert.equal(missed.draft, null);
  assert.equal(existsSync(join(fresh.root, "review/prefix/drafts")), false);
});

test("the same retained observation is acquired on all three sites without a forced consumer", () => {
  const direct = previewReuse(n45, previewOptions).observation;
  const plan = [
    ["native", "samedaydesk"],
    ["native", "ein-llc"],
    ["native", "neomorphic-io"],
    ["mcp", "samedaydesk"],
    ["review", "ein-llc"],
  ];
  for (const [consumer, site] of plan) {
    const { root } = install(consumer, site);
    const ran = runInstalled({ consumer, store: root, job: previewJob() });
    assert.equal(ran.ok, true, `${consumer} ${site} ${ran.message}`);
    assert.equal(ran.site, site);
    assert.deepEqual(ran.observation, direct);
    assert.equal(ran.published, false);
  }
  const missing = acquireAndRun({ site: "samedaydesk", store: store(), sourceCommit, clock, job: previewJob() });
  assert.equal(missing.ok, false);
  assert.match(missing.message, /no selection is made/);
  const badSite = installConsumer({ consumer: "native", site: "example", store: store(), sourceCommit, clock });
  assert.equal(badSite.ok, false);
  const badCommit = installConsumer({ consumer: "native", site: "samedaydesk", store: store(), sourceCommit: "abc", clock });
  assert.equal(badCommit.ok, false);
  const switched = install("review", "neomorphic-io");
  const moved = updateInstalled({
    consumer: "review",
    store: switched.root,
    version: "0.1.2",
    clock: "2026-11-06T12:06:00.000Z",
    site: "samedaydesk",
  });
  assert.equal(moved.ok, false);
  assert.match(moved.message, /original site/);
});

test("CLI acquire and run leave the committed status prepared", () => {
  const root = store();
  const cli = join(packageRoot, "cli.mjs");
  const acquired = spawnSync(process.execPath, [
    cli, "acquire",
    "--consumer", "native",
    "--site", "samedaydesk",
    "--store", root,
    "--source", sourceCommit,
    "--clock", clock,
  ], { encoding: "utf8", cwd: repo });
  assert.equal(acquired.status, 0, acquired.stderr);
  const body = JSON.parse(acquired.stdout);
  assert.equal(body.record.installationStatus, "source_only_not_installed");
  const ran = spawnSync(process.execPath, [
    cli, "run",
    "--consumer", "native",
    "--store", root,
    "--input", join(packageRoot, "fixtures/inputs/fitting-n45-page-change.json"),
    "--task-id", previewOptions.taskId,
    "--subject", previewOptions.subject,
    "--sequence", "1",
    "--clock", previewOptions.clock,
  ], { encoding: "utf8", cwd: repo });
  assert.equal(ran.status, 0, ran.stderr);
  const result = JSON.parse(ran.stdout);
  assert.equal(result.executionDeclaration, "native_package_executed");
  assert.deepEqual(result.observation, previewReuse(n45, previewOptions).observation);
  const unselected = spawnSync(process.execPath, [
    cli, "acquire",
    "--site", "samedaydesk",
    "--store", root,
    "--source", sourceCommit,
    "--clock", clock,
  ], { encoding: "utf8", cwd: repo });
  assert.equal(unselected.status, 1);
  assert.match(unselected.stderr, /no selection is made/);
});
