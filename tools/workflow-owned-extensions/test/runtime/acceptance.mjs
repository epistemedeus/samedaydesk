#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { previewReuse } from "../../../result-reuse/src/export.mjs";
import {
  embedFittingDraft,
  fallbackThroughCli,
  loadRuntimeAuth,
  refuseNonfitting,
  removeEmbeddedDraft,
  reuseRetainedObservation,
  updateEmbeddedDraft,
} from "../../src/ghost-embed.mjs";
import { listPosts, parseAdminKey, probeGhost } from "../../src/ghost-runtime.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "../..");
const repoRoot = join(packageRoot, "../..");
const fixtures = join(packageRoot, "fixtures/inputs");

const url = (process.env.GHOST_URL || "").replace(/\/+$/, "");
const outDir = process.env.OUT || "";
const keyFile = process.env.GHOST_ADMIN_API_KEY_FILE;
const contentKeyFile = process.env.GHOST_CONTENT_API_KEY_FILE;
let authKeyId = null;

if (!url || !keyFile) {
  fail("acceptance requires GHOST_URL and GHOST_ADMIN_API_KEY_FILE");
}

const auth = loadRuntimeAuth({ url, keyFile, contentKeyFile });
if (!auth.ok) fail(auth.message);
const parsedKey = parseAdminKey(auth.key);
authKeyId = parsedKey.ok ? parsedKey.id : null;

const n45 = readJson(join(fixtures, "fitting-n45-page-change.json"));
const chat = readJson(join(fixtures, "nonfitting-unrecognized-chat-task.json"));
const beforeWork = readJson(join(fixtures, "fitting-before-work.json"));
const produced = readJson(join(fixtures, "fitting-produced-decision.json"));
const n45Options = {
  taskId: "n45-example-com",
  subject: "n45-example-com-result",
  sequence: 1,
  clock: "2026-09-09T08:00:00.000Z",
};
const decisionOptions = {
  taskId: "source-change-example",
  subject: "source-change-example-decision",
  sequence: 1,
  clock: "2026-09-09T08:00:00.000Z",
  horizonHours: 168,
  optIn: true,
};

const report = { runtime: "ghost", cases: {} };
const reachable = await probeGhost(url);
if (!reachable.reachable) fail(reachable.message || "ghost runtime is unreachable");

const baseline = await listPosts({ url: auth.url, key: auth.key });
if (!baseline.ok) {
  fail(baseline.message, {
    keyId: baseline.keyId || authKeyId,
    endpoint: baseline.endpoint || baseline.path || `${url}/ghost/api/admin/posts/`,
    status: baseline.status ?? null,
  });
}
const beforeIds = new Set(baseline.posts.map((post) => post.id));

const preview = previewReuse(n45, n45Options);
if (!preview.ok) fail(preview.message || "previewReuse refused the fitting fixture");

const fitting = await embedFittingDraft({
  url: auth.url,
  key: auth.key,
  contentKey: auth.contentKey,
  observation: preview.observation,
});
report.cases.fitting = {
  ok: fitting.ok === true && fitting.neverPublished === true && fitting.post?.status === "draft",
  postId: fitting.post?.id ?? null,
  status: fitting.post?.status ?? null,
  published_at: fitting.post?.published_at ?? null,
  title: fitting.post?.title ?? null,
  neverPublished: fitting.neverPublished === true,
  absentFromContentApi: fitting.absentFromContentApi ?? null,
  contentApiChecked: fitting.contentApiChecked === true,
  message: fitting.message ?? null,
};
const draftId = fitting.post?.id || null;
const afterFittingIds = new Set([...beforeIds, draftId].filter(Boolean));

const unrecognized = await refuseNonfitting({
  url: auth.url,
  key: auth.key,
  input: chat,
  beforeIds: afterFittingIds,
});
const missingIdentity = await refuseNonfitting({
  url: auth.url,
  key: auth.key,
  input: n45,
  taskId: null,
  beforeIds: afterFittingIds,
});
report.cases.nonfitting = {
  ok: unrecognized.ok === true
    && missingIdentity.ok === true
    && unrecognized.draftCreated === false
    && missingIdentity.draftCreated === false,
  unrecognizedRefused: unrecognized.refused === true,
  missingIdentityRefused: missingIdentity.refused === true,
  draftCreated: unrecognized.draftCreated || missingIdentity.draftCreated,
  unrecognizedMessage: unrecognized.invocation?.message ?? unrecognized.message ?? null,
  missingIdentityMessage: missingIdentity.invocation?.message ?? missingIdentity.message ?? null,
};

const reused = await reuseRetainedObservation({
  url: auth.url,
  key: auth.key,
  beforeWork,
  produced,
  options: decisionOptions,
});
report.cases.retainedReuse = {
  ok: reused.ok === true && reused.producerInvoked === false && reused.identicalContent === true,
  producerInvoked: reused.producerInvoked ?? null,
  identicalContent: reused.identicalContent === true,
  postId: reused.post?.id ?? null,
  message: reused.message ?? null,
};

const updated = draftId
  ? await updateEmbeddedDraft({
    url: auth.url,
    key: auth.key,
    id: draftId,
    observation: preview.observation,
    version: "0.1.1",
  })
  : { ok: false, message: "no fitting draft to update" };
report.cases.update = {
  ok: updated.ok === true && updated.sameId === true && updated.status === "draft",
  sameId: updated.sameId === true,
  status: updated.status ?? null,
  published_at: updated.published_at ?? null,
  excerpt: updated.excerpt ?? null,
  message: updated.message ?? null,
};

const removedFitting = draftId
  ? await removeEmbeddedDraft({ url: auth.url, key: auth.key, id: draftId })
  : { ok: false, message: "no fitting draft to remove" };
const removedReuse = reused.post?.id && reused.post.id !== draftId
  ? await removeEmbeddedDraft({ url: auth.url, key: auth.key, id: reused.post.id })
  : { ok: true, skipped: true };
report.cases.remove = {
  ok: removedFitting.ok === true && removedReuse.ok === true,
  fittingAbsent: removedFitting.absentFromList === true,
  reuseAbsent: removedReuse.skipped === true || removedReuse.absentFromList === true,
  readbackStatus: removedFitting.readbackStatus ?? null,
  message: removedFitting.message ?? removedReuse.message ?? null,
};

const unreachable = await probeGhost("http://127.0.0.1:1");
const fallback = await fallbackThroughCli({
  repoRoot,
  inputPath: join(fixtures, "fitting-n45-page-change.json"),
  taskId: n45Options.taskId,
  subject: n45Options.subject,
  sequence: n45Options.sequence,
  clock: n45Options.clock,
  consumer: "ghost",
});
report.cases.fallback = {
  ok: unreachable.reachable === false
    && fallback.ok === true
    && fallback.labeled === "fallback"
    && fallback.executionPath === "direct_sdk_fallback",
  runtimeReachable: unreachable.reachable === true,
  labeled: fallback.labeled,
  executionPath: fallback.executionPath,
  runtimeCalled: fallback.runtimeCalled,
  message: fallback.message,
};

report.ok = Object.values(report.cases).every((item) => item && item.ok === true);
report.runtimeExecutionStatus = "runtime-executed";
report.note = "VM acceptance output only. Committed manifests stay unexecuted.";

if (outDir) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "runtime-acceptance.json"), `${JSON.stringify(report, null, 2)}\n`);
}

process.stdout.write(`${JSON.stringify({ ok: report.ok, cases: summarize(report.cases) }, null, 2)}\n`);
process.exit(report.ok ? 0 : 1);

function summarize(cases) {
  const out = {};
  for (const [name, value] of Object.entries(cases)) {
    out[name] = { ok: value.ok === true };
    if (value.postId) out[name].postId = value.postId;
    if (value.status) out[name].status = value.status;
    if (value.labeled) out[name].labeled = value.labeled;
    if (value.producerInvoked !== undefined) out[name].producerInvoked = value.producerInvoked;
  }
  return out;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function fail(message, extra = {}) {
  const body = { ok: false, message: String(message) };
  const keyId = extra.keyId !== undefined ? extra.keyId : authKeyId;
  const endpoint = extra.endpoint !== undefined ? extra.endpoint : extra.path;
  const status = extra.status !== undefined ? extra.status : null;
  if (keyId) body.keyId = keyId;
  if (endpoint) body.endpoint = endpoint;
  if (status != null) body.status = status;
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "runtime-acceptance.json"), `${JSON.stringify(body, null, 2)}\n`);
  }
  process.stderr.write(`${JSON.stringify(body)}\n`);
  process.exit(1);
}
