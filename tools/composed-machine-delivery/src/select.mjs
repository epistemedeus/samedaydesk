import { join } from "node:path";
import { previewReuse } from "../../result-reuse/src/export.mjs";
import { acquireAndRun, workflowInputFits } from "../../workflow-owned-extensions/src/acquire.mjs";
import { DIRECT_FALLBACK } from "../../workflow-owned-extensions/src/pins.mjs";
import { digest } from "./json.mjs";
import { BASE_SOURCE, BLOCKED_NEEDS, DIRECT_PREVIEW, NEED_TO_CONSUMER } from "./pins.mjs";

function agrees(capture, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, reason: "extension_input_required" };
  }
  const url = capture.sourceUri || capture.payload?.url;
  const title = capture.payload?.title;
  const hash = capture.payload?.contentHash;
  if (typeof input.url === "string" && url && input.url !== url) return { ok: false, reason: "capture_mismatch" };
  if (typeof input.title === "string" && title && input.title !== title) return { ok: false, reason: "capture_mismatch" };
  if (typeof input.contentHash === "string" && hash && input.contentHash !== hash) {
    return { ok: false, reason: "capture_mismatch" };
  }
  return { ok: true };
}

function directRoute(message, extra = {}) {
  return {
    ok: true,
    need: extra.need || "observation",
    selected: "direct",
    consumer: null,
    fitting: extra.fitting === true,
    acquired: false,
    published: false,
    executionDeclaration: extra.fitting === true ? "direct_cli" : "unsupported_execution",
    executionPath: "direct_sdk_fallback",
    observationDigest: extra.observationDigest || null,
    directObservationMatches: extra.directObservationMatches === true,
    directCommand: DIRECT_PREVIEW,
    usefulDirectRoute: DIRECT_FALLBACK.cli,
    message,
  };
}

function previewDigest(input, extension, capture, clock) {
  const preview = previewReuse(input, {
    taskId: extension.taskId || capture.subject,
    subject: extension.subject || capture.subject,
    sequence: extension.sequence || 1,
    clock,
  });
  if (!preview.ok) return { ok: false, reason: "direct_preview_refused", message: preview.message };
  return { ok: true, digest: digest(preview.observation), observation: preview.observation };
}

/**
 * Choose an existing workflow surface only when the caller names one and the
 * retained observation fits that surface. Observation-only callers stay on
 * the result-reuse CLI. Unsupported installers are not started.
 */
export function selectExtension({ request, capture, store } = {}) {
  const extension = request.extension || {};
  const need = extension.need || "observation";
  if (extension.publish === true) {
    return { ok: false, reason: "publication_refused", message: "human publication is reserved and was not performed", published: false };
  }
  const input = extension.input;
  if (need === "observation") {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return directRoute("no workflow input was supplied; decisions stay on the recurring consumer", { need, fitting: false });
    }
    const agreement = agrees(capture, input);
    if (!agreement.ok) return { ...agreement, acquired: false, published: false, selected: "direct" };
    if (!workflowInputFits(input)) {
      return directRoute("the retained observation does not fit a workflow extension", { need, fitting: false });
    }
    const preview = previewDigest(input, extension, capture, request.clock);
    if (!preview.ok) return preview;
    return directRoute("the existing result-reuse preview is the direct path; no workflow consumer was acquired", {
      need,
      fitting: true,
      observationDigest: preview.digest,
      directObservationMatches: true,
    });
  }
  if (BLOCKED_NEEDS.includes(need)) {
    const blocked = acquireAndRun({ consumer: need, site: extension.site, store, sourceCommit: BASE_SOURCE, clock: request.clock, job: { input } });
    return {
      ok: true,
      need,
      selected: null,
      consumer: need,
      fitting: false,
      acquired: false,
      published: false,
      executionDeclaration: blocked.executionDeclaration || "unsupported_execution",
      message: blocked.message,
      directCommand: DIRECT_PREVIEW,
    };
  }
  const consumer = NEED_TO_CONSUMER[need];
  if (!consumer) {
    return { ok: false, reason: "need_unsupported", message: "need must name observation, local-process, mcp-tool, or unpublished-review", published: false };
  }
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const agreement = agrees(capture, input);
    if (!agreement.ok) return { ...agreement, acquired: false, published: false, selected: consumer };
  }
  if (!input || typeof input !== "object" || Array.isArray(input) || !workflowInputFits(input)) {
    return {
      ok: true,
      need,
      selected: consumer,
      consumer,
      fitting: false,
      acquired: false,
      published: false,
      executionDeclaration: "unsupported_execution",
      message: input ? "input does not fit an existing workflow extension" : "extension input was not supplied",
      directCommand: DIRECT_PREVIEW,
    };
  }
  const agreement = agrees(capture, input);
  if (!agreement.ok) return { ...agreement, acquired: false, published: false, selected: consumer };
  if (!extension.site) return { ok: false, reason: "site_required", message: "the caller must name samedaydesk, ein-llc, or neomorphic-io", published: false };
  const source = extension.source || BASE_SOURCE;
  const ran = acquireAndRun({
    consumer,
    site: extension.site,
    store: join(store, "extensions"),
    sourceCommit: source,
    clock: request.clock,
    job: {
      tool: "preview_reuse",
      input,
      task_id: extension.taskId || capture.subject,
      subject: extension.subject || capture.subject,
      sequence: extension.sequence || 1,
      clock: request.clock,
      publish: false,
    },
  });
  const direct = previewDigest(input, extension, capture, request.clock);
  return {
    ok: ran.ok !== false,
    need,
    selected: consumer,
    consumer,
    fitting: ran.fitting === true,
    acquired: ran.acquire?.prepared === true,
    published: ran.published === true,
    executionDeclaration: ran.executionDeclaration || null,
    observationDigest: direct.ok ? direct.digest : null,
    directObservationMatches: direct.ok && ran.observation ? digest(ran.observation) === direct.digest : false,
    message: ran.message || null,
    directCommand: DIRECT_PREVIEW,
    reason: ran.ok === false ? "extension_run_failed" : undefined,
  };
}
