import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { invoke, projectGhostDraft } from "./adapter.mjs";
import { bindUsefulDecision, decideOrReuse } from "../../result-reuse/src/export.mjs";
import {
  createDraft,
  deleteDraft,
  getPost,
  listContentPosts,
  listPosts,
  probeGhost,
  readAdminKeyFromFile,
  updateDraft,
  GHOST_REUSE_TAG,
} from "./ghost-runtime.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const PACKAGE_CLI = join(here, "../cli.mjs");

export function loadRuntimeAuth({ url, keyFile, key, contentKeyFile, contentKey } = {}) {
  const resolvedKey = key
    ? { ok: true, value: key }
    : readAdminKeyString(keyFile);
  if (!resolvedKey.ok) return resolvedKey;
  let content = contentKey || null;
  if (!content && contentKeyFile) {
    const loaded = readPlainSecret(contentKeyFile);
    if (loaded.ok) content = loaded.value;
  }
  return { ok: true, url, key: resolvedKey.value, contentKey: content };
}

function readAdminKeyString(path) {
  const loaded = readAdminKeyFromFile(path);
  if (!loaded.ok) return loaded;
  return { ok: true, value: `${loaded.id}:${loaded.secret}` };
}

function readPlainSecret(path) {
  if (typeof path !== "string" || path.trim() === "") {
    return { ok: false, message: "secret file path is missing" };
  }
  try {
    const value = readFileSync(path, "utf8").trim();
    if (!value) return { ok: false, message: "secret file is empty" };
    return { ok: true, value };
  } catch {
    return { ok: false, message: "cannot read secret file" };
  }
}

export function observationFromSdk(sdk) {
  return sdk?.observation
    || sdk?.decision?.observation
    || (sdk?.decision?.schema ? sdk.decision : null)
    || null;
}

export function draftFieldsFromObservation(observation, { excerptNote } = {}) {
  const projected = projectGhostDraft({ ok: true, observation });
  const excerpt = excerptNote
    ? `${projected.custom_excerpt || observation?.schema || "observation"}; ${excerptNote}`.slice(0, 300)
    : projected.custom_excerpt;
  const statement = typeof observation?.statement === "string" ? observation.statement : "";
  const html = `<p>${escapeHtml(statement || projected.title || "")}</p>`;
  return {
    title: projected.title,
    excerpt,
    html,
    plaintext: statement,
    tags: [{ name: GHOST_REUSE_TAG }],
    projected,
  };
}

export async function embedFittingDraft({ url, key, contentKey, observation, excerptNote } = {}) {
  if (!observation || typeof observation !== "object") {
    return { ok: false, fitting: false, message: "no observation is available to embed" };
  }
  const fields = draftFieldsFromObservation(observation, { excerptNote });
  const created = await createDraft({
    url,
    key,
    title: fields.title,
    html: fields.html,
    excerpt: fields.excerpt,
    tags: fields.tags,
  });
  if (!created.ok) return { ...created, fitting: true, capabilityApplied: false };
  const readback = await getPost({ url, key, id: created.post.id });
  if (!readback.ok) return { ...readback, fitting: true, created: created.post };
  const contentCheck = await unpublishedOnContentApi({ url, contentKey, post: readback.post });
  return {
    ok: true,
    fitting: true,
    capabilityApplied: true,
    executionPath: "ghost_admin_api",
    fallback: false,
    post: readback.post,
    neverPublished: readback.post.status === "draft" && readback.post.published_at == null,
    absentFromContentApi: contentCheck.absent,
    contentApiChecked: contentCheck.checked,
  };
}

export async function refuseNonfitting({
  url,
  key,
  input,
  tool = "preview_reuse",
  beforeIds,
  taskId = "n45-example-com",
  subject = "n45-example-com-result",
  sequence = 1,
  clock = "2026-09-09T08:00:00.000Z",
} = {}) {
  const invoked = invoke({
    consumer: "ghost",
    tool,
    input,
    task_id: taskId,
    subject,
    sequence,
    clock,
  });
  const listed = await listPosts({ url, key });
  if (!listed.ok) return { ...listed, invocation: invoked };
  const afterIds = new Set(listed.posts.map((post) => post.id));
  const created = beforeIds
    ? listed.posts.filter((post) => !beforeIds.has(post.id))
    : [];
  const refused = invoked.fitting === false || invoked.ok === false;
  return {
    ok: refused && created.length === 0,
    fitting: invoked.fitting === true,
    refused,
    draftCreated: created.length > 0,
    createdIds: created.map((post) => post.id),
    afterIds: [...afterIds],
    invocation: {
      ok: invoked.ok,
      fitting: invoked.fitting,
      message: invoked.message,
      executionPath: invoked.executionPath,
    },
  };
}

export async function reuseRetainedObservation({
  url,
  key,
  beforeWork,
  produced,
  options,
  existingPostId,
} = {}) {
  const bound = bindUsefulDecision(beforeWork, produced, options);
  if (!bound.ok) return { ok: false, message: bound.message, producerInvoked: bound.producerInvoked ?? null };
  const reused = decideOrReuse(bound.observation, beforeWork, options);
  if (!reused.ok) {
    return { ok: false, message: reused.message, producerInvoked: reused.producerInvoked ?? null };
  }
  const firstObservation = observationFromSdk(bound);
  const reusedObservation = observationFromSdk(reused) || firstObservation;
  const firstFields = draftFieldsFromObservation(firstObservation);
  const reusedFields = draftFieldsFromObservation(reusedObservation);
  let post;
  if (existingPostId) {
    const current = await getPost({ url, key, id: existingPostId });
    if (!current.ok) return { ...current, producerInvoked: reused.producerInvoked };
    post = current.post;
  } else {
    const created = await createDraft({
      url,
      key,
      title: firstFields.title,
      html: firstFields.html,
      excerpt: firstFields.excerpt,
      tags: firstFields.tags,
    });
    if (!created.ok) return { ...created, producerInvoked: reused.producerInvoked };
    const readback = await getPost({ url, key, id: created.post.id });
    if (!readback.ok) return { ...readback, producerInvoked: reused.producerInvoked };
    post = readback.post;
  }
  const identicalContent = firstFields.title === reusedFields.title
    && firstFields.plaintext === reusedFields.plaintext
    && (post.title === firstFields.title || (typeof post.plaintext === "string" && post.plaintext.includes(firstFields.plaintext)));
  return {
    ok: reused.producerInvoked === false && identicalContent,
    producerInvoked: reused.producerInvoked,
    identicalContent,
    boundRevision: bound.revision ?? firstObservation?.revisionId ?? null,
    reusedRevision: reused.revision ?? reusedObservation?.revisionId ?? null,
    post,
    firstTitle: firstFields.title,
    reusedTitle: reusedFields.title,
  };
}

export async function updateEmbeddedDraft({ url, key, id, observation, version } = {}) {
  const current = await getPost({ url, key, id });
  if (!current.ok) return current;
  const fields = draftFieldsFromObservation(observation, { excerptNote: `version ${version}` });
  const html = `${fields.html}<p>version ${escapeHtml(String(version))}</p>`;
  const updated = await updateDraft({
    url,
    key,
    id,
    updatedAt: current.post.updated_at,
    title: fields.title,
    html,
    excerpt: fields.excerpt,
    tags: fields.tags,
  });
  if (!updated.ok) return updated;
  const readback = await getPost({ url, key, id });
  if (!readback.ok) return readback;
  const versionMark = `version ${version}`;
  const body = `${readback.post.plaintext || ""} ${readback.post.custom_excerpt || ""}`;
  return {
    ok: readback.post.id === id && readback.post.status === "draft" && body.includes(versionMark),
    sameId: readback.post.id === id,
    status: readback.post.status,
    published_at: readback.post.published_at,
    excerpt: readback.post.custom_excerpt,
    plaintext: readback.post.plaintext,
    versionApplied: body.includes(versionMark),
    version,
    post: readback.post,
  };
}

export async function removeEmbeddedDraft({ url, key, id } = {}) {
  const deleted = await deleteDraft({ url, key, id });
  if (!deleted.ok) return deleted;
  const again = await getPost({ url, key, id });
  const listed = await listPosts({ url, key });
  const present = listed.ok ? listed.posts.some((post) => post.id === id) : null;
  return {
    ok: again.ok === false && present === false,
    deleted: deleted.deleted,
    readbackStatus: again.status ?? null,
    absentFromList: present === false,
    post: again.post ?? null,
  };
}

export async function fallbackThroughCli({
  repoRoot,
  inputPath,
  taskId,
  subject,
  sequence,
  clock,
  consumer = "ghost",
} = {}) {
  const cli = PACKAGE_CLI;
  const result = spawnSync(process.execPath, [
    cli,
    "preview",
    "--consumer", consumer,
    "--input", inputPath,
    "--task-id", taskId,
    "--subject", subject,
    "--sequence", String(sequence),
    "--clock", clock,
  ], {
    encoding: "utf8",
    cwd: repoRoot,
  });
  let body = null;
  try {
    body = JSON.parse(result.stdout);
  } catch {
    body = null;
  }
  const labeledFallback = body?.executionPath === "direct_sdk_fallback"
    && body?.runtimeCalled === false;
  return {
    ok: result.status === 0 && labeledFallback && body?.ok === true,
    exitCode: result.status,
    labeled: labeledFallback ? "fallback" : "not-fallback",
    executionPath: body?.executionPath ?? null,
    runtimeCalled: body?.runtimeCalled ?? null,
    runtime: body?.runtime ?? null,
    fitting: body?.fitting ?? null,
    message: body?.message ?? null,
  };
}

export async function unpublishedOnContentApi({ url, contentKey, post } = {}) {
  if (!contentKey || !post?.id) return { checked: false, absent: null };
  const listed = await listContentPosts({ url, contentKey });
  if (!listed.ok) return { checked: false, absent: null, message: listed.message };
  const found = listed.posts.some((item) => item.id === post.id || item.slug === post.slug);
  return { checked: true, absent: !found };
}

export async function requireReachableGhost(url) {
  const probed = await probeGhost(url);
  if (!probed.reachable) {
    return { ok: false, message: probed.message || "ghost runtime is unreachable" };
  }
  return { ok: true, probe: probed };
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}
