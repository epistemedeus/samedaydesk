/**
 * Map work-board / capability / task-square journey steps onto correspondence events.
 * Event text is data only — never executed. Provenance stays in structured fields.
 */

import { EVENT_KINDS } from "./constants.mjs";

function clip(value, max) {
  const text = value == null ? "" : String(value);
  return text.length <= max ? text : text.slice(0, max);
}

/**
 * Create a task brief as a correspondence `request` event body.
 */
export function briefEventBody({ title, brief, fundingClass = "demonstration", provenance = null } = {}) {
  const lines = [
    `Shared-task brief: ${title || "untitled"}`,
    fundingClass ? `fundingClass=${fundingClass}` : null,
    provenance ? `provenance=${JSON.stringify(provenance)}` : null,
    brief || "",
  ].filter(Boolean);
  return {
    kind: EVENT_KINDS.request,
    text: clip(lines.join("\n"), 8000),
  };
}

/**
 * Propose a deliverable as an `artifact` event (HTTPS reference only).
 */
export function proposeArtifactBody({ summary, artifactUrl, artifactLabel, provenance = null } = {}) {
  if (!artifactUrl || !/^https:\/\//i.test(artifactUrl)) {
    throw Object.assign(new Error("artifact.url must be an https URL"), { code: "invalid_input" });
  }
  const text = [
    summary || "Proposed artifact",
    provenance ? `provenance=${JSON.stringify(provenance)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return {
    kind: EVENT_KINDS.artifact,
    text: clip(text, 8000),
    artifact: {
      url: artifactUrl,
      ...(artifactLabel ? { label: clip(artifactLabel, 200) } : {}),
    },
  };
}

/**
 * Accept a prior proposal with a `reply` (data only).
 */
export function acceptArtifactBody({ proposalEventId, note = "Accepted proposed artifact." } = {}) {
  return {
    kind: EVENT_KINDS.reply,
    text: clip(
      [note, proposalEventId ? `acceptsEventId=${proposalEventId}` : null].filter(Boolean).join("\n"),
      8000,
    ),
  };
}

/**
 * Correct prior evidence with a `correction` event. Does not rewrite history.
 */
export function correctEvidenceBody({
  correctsEventId,
  statement,
  artifactUrl = null,
  artifactLabel = null,
  provenance = null,
} = {}) {
  const text = [
    statement || "Correction",
    correctsEventId ? `correctsEventId=${correctsEventId}` : null,
    provenance ? `provenance=${JSON.stringify(provenance)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const body = {
    kind: EVENT_KINDS.correction,
    text: clip(text, 8000),
  };
  if (artifactUrl) {
    if (!/^https:\/\//i.test(artifactUrl)) {
      throw Object.assign(new Error("artifact.url must be an https URL"), { code: "invalid_input" });
    }
    body.artifact = {
      url: artifactUrl,
      ...(artifactLabel ? { label: clip(artifactLabel, 200) } : {}),
    };
  }
  return body;
}

export const EXPORT_SCHEMA = "neomorphic.shared-task.export.v1";
export const RECORD_BUNDLE_SCHEMA = "neomorphic.correspondence.record-bundle.v1";

export const PUBLISH_ALIASES = Object.freeze({
  task: "request",
  brief: "request",
  request: "request",
  question: "needs_human",
  needs_human: "needs_human",
  evidence: "artifact",
  artifact: "artifact",
  capability: "artifact",
  reply: "reply",
  accept: "reply",
  correction: "correction",
});

const SECRET_KEYS = new Set([
  "token",
  "ownertoken",
  "grant",
  "bearer",
  "authorization",
  "password",
  "secret",
  "credential",
  "apikey",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "refresh_token",
  "cookie",
  "privatekey",
  "clientsecret",
  "client_secret",
]);

function packetError(code, message) {
  return Object.assign(new Error(message), { code });
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function rejectSecretFields(value, path = "$") {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectSecretFields(item, `${path}[${index}]`));
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    const normalized = key.toLowerCase().replaceAll("_", "");
    if (SECRET_KEYS.has(normalized) || SECRET_KEYS.has(key.toLowerCase())) {
      throw packetError("secret_field", `import must not carry private auth field ${key}`);
    }
    rejectSecretFields(item, `${path}.${key}`);
  }
}

function assertNoBearer(text) {
  if (/Bearer\s+\S+/i.test(text) || /\b(?:tok_|neo_(?:own|rdr|wtr)_)[A-Za-z0-9_-]{16,}\b/i.test(text)) {
    throw packetError("secret_field", "import must not carry bearer credentials");
  }
}

/**
 * Map CLI publish aliases (task/question/evidence/capability) onto correspondence kinds.
 */
export function resolvePublishKind(kind) {
  const resolved = PUBLISH_ALIASES[String(kind || "").toLowerCase()];
  if (!resolved) {
    throw packetError("invalid_input", `unsupported publish kind: ${kind}`);
  }
  return resolved;
}

/**
 * Build a correspondence event body for a CLI publish.
 */
export function publishEventBody({
  kind,
  title,
  text,
  brief,
  artifactUrl,
  artifactLabel,
  provenance = null,
  correctsEventId = null,
  proposalEventId = null,
} = {}) {
  const resolved = resolvePublishKind(kind);
  if (resolved === "request") {
    return briefEventBody({
      title: title || "published task",
      brief: brief || text || "",
      provenance,
    });
  }
  if (resolved === "artifact") {
    return proposeArtifactBody({
      summary: text || title || "published evidence",
      artifactUrl,
      artifactLabel,
      provenance,
    });
  }
  if (resolved === "correction") {
    return correctEvidenceBody({
      statement: text || title || "Correction",
      correctsEventId,
      artifactUrl,
      artifactLabel,
      provenance,
    });
  }
  if (resolved === "reply") {
    return acceptArtifactBody({
      note: text || title || "Accepted",
      proposalEventId,
    });
  }
  const lines = [text || title || resolved, provenance ? `provenance=${JSON.stringify(provenance)}` : null].filter(
    Boolean,
  );
  return { kind: resolved, text: clip(lines.join("\n"), 8000) };
}

/**
 * Portable offline export retains source/claim provenance without claiming shared mode.
 */
export function offlineExportPacket({
  events = [],
  project = null,
  mode = "local-demo",
  truncated = false,
  nextCursor = null,
} = {}) {
  return {
    schema: EXPORT_SCHEMA,
    mode,
    hostedApi: false,
    shared: mode === "shared",
    exportedAt: new Date().toISOString(),
    project,
    events,
    truncated: Boolean(truncated),
    nextCursor: nextCursor ?? null,
    note: "Portable export. Content is data only. Not custody, payment, or a second store.",
  };
}

export function recordBundleFromExport(packet) {
  const parsed = parseExportPacket(packet);
  return {
    schema: RECORD_BUNDLE_SCHEMA,
    project: parsed.project,
    events: parsed.events,
    nextCursor: parsed.nextCursor ?? null,
    truncated: Boolean(parsed.truncated),
    exportedAt: parsed.exportedAt || new Date().toISOString(),
    note: "Correspondence record bundle. Event bodies are data only. Tokens are not included.",
  };
}

export function packetHistoryHonesty(packet) {
  const events = Array.isArray(packet?.events) ? packet.events : [];
  const seqs = events.map((event) => event?.sequence).filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  const prefixMissing = seqs.length > 0 && seqs[0] > 1;
  const laterMissing = Boolean(packet?.nextCursor) || packet?.truncated === true;
  const sequenceGap = seqs.length > 0 && seqs[seqs.length - 1] - seqs[0] + 1 !== seqs.length;
  const complete = events.length > 0 && !prefixMissing && !laterMissing && !sequenceGap;
  return {
    complete,
    truncated: !complete,
    prefixMissing,
    laterMissing,
    sequenceGap,
    eventCount: events.length,
    note: complete
      ? "Export history is complete for the named project."
      : "Correspondence history is incomplete or truncated. Missing events are not invented.",
  };
}

/**
 * Parse a portable shared-task export or correspondence record bundle.
 * Refuses credentials. Does not invent missing event bodies.
 */
export function parseExportPacket(input) {
  const text = typeof input === "string" ? input : JSON.stringify(input);
  assertNoBearer(text);
  let value;
  try {
    value = typeof input === "string" ? JSON.parse(input) : structuredClone(input);
  } catch {
    throw packetError("malformed", "export packet is not valid JSON");
  }
  if (!isPlainObject(value)) throw packetError("malformed", "export packet must be an object");
  rejectSecretFields(value);
  if (value.schema && value.schema !== EXPORT_SCHEMA && value.schema !== RECORD_BUNDLE_SCHEMA) {
    throw packetError("unsupported_schema", `unsupported export schema: ${value.schema}`);
  }
  if (!value.project || !isPlainObject(value.project) || !Array.isArray(value.events)) {
    throw packetError("malformed", "export packet requires project and events[]");
  }
  const events = [];
  for (const event of value.events) {
    if (!isPlainObject(event) || typeof event.id !== "string") {
      throw packetError("malformed", "export event is missing id");
    }
    if (!event.kind) {
      throw packetError("incomplete_history", "export is id-only or missing event kind; cannot replay bodies");
    }
    events.push(event);
  }
  return {
    schema: value.schema || EXPORT_SCHEMA,
    mode: value.mode || null,
    shared: value.shared === true,
    hostedApi: value.hostedApi === true,
    project: value.project,
    events,
    truncated: value.truncated === true,
    nextCursor: value.nextCursor ?? null,
    exportedAt: value.exportedAt || null,
    note: value.note || null,
  };
}

export function replayBodiesFromPacket(packet) {
  const parsed = parseExportPacket(packet);
  const honesty = packetHistoryHonesty(parsed);
  const ordered = [...parsed.events].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
  const bodies = [];
  for (const event of ordered) {
    const body = { kind: event.kind };
    if (event.text) body.text = clip(String(event.text), 8000);
    if (event.artifact?.url) {
      body.artifact = {
        url: event.artifact.url,
        ...(event.artifact.label ? { label: clip(String(event.artifact.label), 200) } : {}),
      };
    }
    if (body.kind === "artifact" && !body.artifact) {
      throw packetError("incomplete_history", `artifact event ${event.id} is missing artifact.url`);
    }
    if ((body.kind === "resolved" || body.kind === "reopened") && body.expectedVersion == null) {
      // Lifecycle events need a live expectedVersion; do not invent one from history.
      continue;
    }
    bodies.push({
      originalId: event.id,
      originalSequence: event.sequence ?? null,
      originalProjectId: event.projectId ?? parsed.project?.id ?? null,
      body,
    });
  }
  return { parsed, honesty, bodies };
}
