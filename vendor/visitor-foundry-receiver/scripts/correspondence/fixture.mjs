/**
 * SYNTHETIC browser fixture. Not a correspondence server, not Postgres, and
 * not a hosted origin. It never performs a network fetch. Artifact URLs are
 * stored as data only.
 */
import { DEFAULT_EVENT_LIMIT, EVENT_KINDS, MAX_BODY_BYTES, MAX_EVENT_LIMIT, MIN_EVENT_LIMIT } from "./constants.mjs";

export const SYNTHETIC_FIXTURE_LABEL = "synthetic-browser-fixture";
export const SYNTHETIC_ORIGIN = "https://correspondence.fixture.invalid";
export const SYNTHETIC_PROJECT_ID = "prj_synthetic_workbench";
// In-browser fixture keys only. Do not use neo_own_/neo_wtr_/neo_rdr_/tok_
// prefixes: those shapes are live grants and must not appear in dist.
export const SYNTHETIC_GRANT_TOKEN = "synthetic_fixture_writer_not_a_grant";
export const SYNTHETIC_READER_TOKEN = "synthetic_fixture_reader_not_a_grant";
export const SYNTHETIC_EXPIRED_TOKEN = "synthetic_fixture_expired_not_a_grant";
export const SYNTHETIC_REVOKED_TOKEN = "synthetic_fixture_revoked_not_a_grant";
export const SYNTHETIC_SHORT_TOKEN = "synthetic_fixture_short_lived_not_a_grant";

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function encodeCursor(projectId, sequence) {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify([projectId, sequence])));
}

function decodeCursor(raw, projectId) {
  try {
    const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    const json = atob(padded + pad);
    const value = JSON.parse(json);
    if (!Array.isArray(value) || value.length !== 2 || value[0] !== projectId || !Number.isSafeInteger(value[1]) || value[1] < 1) {
      throw new Error("invalid");
    }
    return value[1];
  } catch {
    const error = new Error("cursor is not valid for this project");
    error.status = 400;
    error.code = "invalid_cursor";
    throw error;
  }
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function errorBody(code, message) {
  return { error: { code, message } };
}

function iso(date) {
  return new Date(date).toISOString();
}

function seedState(now) {
  const createdAt = iso(now);
  const project = {
    id: SYNTHETIC_PROJECT_ID,
    title: "Synthetic handoff (fixture)",
    summary: "A labeled, in-browser record used only to demonstrate the workbench. It is not a live project and not evidence of hosted correspondence customers.",
    status: "open",
    version: 1,
    nextAction: { kind: "reply" },
    createdAt,
    updatedAt: createdAt,
  };
  const events = [
    {
      id: "ev_synthetic_request",
      projectId: SYNTHETIC_PROJECT_ID,
      sequence: 1,
      kind: "request",
      text: "Please review the bounded readiness note after the provider change.",
      createdAt,
    },
    {
      id: "ev_synthetic_artifact",
      projectId: SYNTHETIC_PROJECT_ID,
      sequence: 2,
      kind: "artifact",
      artifact: {
        url: "https://neomorphic.io/api/receipts/lab-release-2026-09-01.json",
        label: "public lab receipt (reference only)",
      },
      createdAt,
    },
  ];
  return {
    project,
    events,
    grants: new Map([
      [SYNTHETIC_GRANT_TOKEN, { role: "writer", expiresAt: null, revokedAt: null }],
      [SYNTHETIC_READER_TOKEN, { role: "reader", expiresAt: null, revokedAt: null }],
      [SYNTHETIC_EXPIRED_TOKEN, { role: "writer", expiresAt: iso(now - 1000), revokedAt: null }],
      [SYNTHETIC_REVOKED_TOKEN, { role: "writer", expiresAt: null, revokedAt: createdAt }],
      [SYNTHETIC_SHORT_TOKEN, { role: "writer", expiresAt: iso(now + 60_000), revokedAt: null }],
    ]),
    idempotency: new Map(),
  };
}

export function createSyntheticFixture({ clock = () => Date.now() } = {}) {
  const state = seedState(clock());
  const stats = { requests: 0, foreignFetches: 0, artifactUrlStored: 0, networkAttempts: 0 };
  let armed = null;

  function requireGrant(token, roles) {
    if (!token) {
      const error = new Error("invalid grant");
      error.status = 401;
      error.code = "unauthorized";
      throw error;
    }
    const grant = state.grants.get(token);
    if (!grant || grant.revokedAt) {
      const error = new Error("invalid grant");
      error.status = 401;
      error.code = "unauthorized";
      throw error;
    }
    if (grant.expiresAt && Date.parse(grant.expiresAt) <= clock()) {
      const error = new Error("invalid grant");
      error.status = 401;
      error.code = "unauthorized";
      throw error;
    }
    if (roles && !roles.includes(grant.role)) {
      const error = new Error("insufficient scope");
      error.status = 403;
      error.code = "forbidden";
      throw error;
    }
    return grant;
  }

  function applyEvent(kind, nowIso) {
    const project = state.project;
    if (project.status === "resolved" && !["resolved", "reopened"].includes(kind)) {
      const error = new Error("resolved projects must be reopened before new events");
      error.status = 409;
      error.code = "conflict";
      throw error;
    }
    if (kind === "needs_human") {
      project.status = "needs_human";
      project.nextAction = { kind: "human_review" };
    } else if (kind === "resolved") {
      project.status = "resolved";
      project.version += 1;
      project.nextAction = null;
    } else if (kind === "reopened") {
      project.status = "open";
      project.version += 1;
      project.nextAction = null;
    } else if (kind === "request") {
      project.nextAction = { kind: "reply" };
    } else if (kind === "reply" && project.nextAction?.kind === "reply") {
      project.nextAction = null;
    }
    project.updatedAt = nowIso;
  }

  async function fetchImpl(input, init = {}) {
    const url = typeof input === "string" ? input : input.url;
    const parsed = new URL(url, SYNTHETIC_ORIGIN);
    if (parsed.origin !== SYNTHETIC_ORIGIN) {
      stats.foreignFetches += 1;
      stats.networkAttempts += 1;
      throw new Error("synthetic fixture does not fetch remote URLs");
    }
    stats.requests += 1;
    if (armed === "offline") {
      armed = null;
      throw new TypeError("synthetic fixture offline");
    }
    if (armed === "unknown") {
      armed = null;
      throw new TypeError("synthetic fixture unknown outcome");
    }
    const method = String(init.method || "GET").toUpperCase();
    const path = parsed.pathname.replace(/\/$/, "") || "/";
    const token = bearer(init);
    const key = header(init, "Idempotency-Key");
    try {
      if (method === "GET" && path === `/v1/projects/${SYNTHETIC_PROJECT_ID}`) {
        requireGrant(token);
        return jsonResponse(200, { project: { ...state.project } });
      }
      if (method === "GET" && path === `/v1/projects/${SYNTHETIC_PROJECT_ID}/events`) {
        requireGrant(token);
        return listEvents(parsed.searchParams);
      }
      if (method === "POST" && path === `/v1/projects/${SYNTHETIC_PROJECT_ID}/events`) {
        requireGrant(token, ["writer", "owner"]);
        return postEvent(init.body, key);
      }
      if (path.startsWith("/v1/projects/") && path.split("/")[3] && path.split("/")[3] !== SYNTHETIC_PROJECT_ID) {
        requireGrant(token);
        return jsonResponse(404, errorBody("not_found", "project not found"));
      }
      return jsonResponse(400, errorBody("invalid_input", "unsupported synthetic route"));
    } catch (error) {
      if (error.status) return jsonResponse(error.status, errorBody(error.code || "invalid_input", error.message));
      throw error;
    }
  }

  function listEvents(search) {
    let limit = DEFAULT_EVENT_LIMIT;
    const rawLimit = search.get("limit");
    if (rawLimit != null) {
      limit = Number(rawLimit);
      if (!Number.isInteger(limit) || limit < MIN_EVENT_LIMIT || limit > MAX_EVENT_LIMIT) {
        return jsonResponse(400, errorBody("invalid_input", "limit must be an integer from 1 to 100"));
      }
    }
    const after = search.get("after");
    let start = 0;
    if (after) {
      try {
        const sequence = decodeCursor(after, SYNTHETIC_PROJECT_ID);
        const index = state.events.findIndex((event) => event.sequence === sequence);
        if (index === -1) return jsonResponse(400, errorBody("invalid_cursor", "cursor is not valid for this project"));
        start = index + 1;
      } catch (error) {
        return jsonResponse(400, errorBody("invalid_cursor", error.message));
      }
    }
    const slice = state.events.slice(start, start + limit).map(cloneEvent);
    const nextCursor = slice.length ? encodeCursor(SYNTHETIC_PROJECT_ID, slice[slice.length - 1].sequence) : null;
    return jsonResponse(200, { events: slice, nextCursor });
  }

  function postEvent(rawBody, idempotencyKey) {
    if (!idempotencyKey || String(idempotencyKey).trim().length < 8) {
      return jsonResponse(400, errorBody("invalid_input", "Idempotency-Key header is required"));
    }
    const raw = typeof rawBody === "string" ? rawBody : "";
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return jsonResponse(413, errorBody("payload_too_large", "request body exceeds 32KiB"));
    }
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return jsonResponse(400, errorBody("invalid_input", "malformed JSON body"));
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonResponse(400, errorBody("invalid_input", "JSON body is required"));
    }
    const extra = Object.keys(body).filter((key) => !["kind", "text", "artifact", "expectedVersion"].includes(key));
    if (extra.length) return jsonResponse(400, errorBody("invalid_input", "unsupported fields"));
    if (!EVENT_KINDS.includes(body.kind)) return jsonResponse(400, errorBody("invalid_input", "unknown event kind"));
    const canonical = JSON.stringify({
      kind: body.kind,
      text: body.text ?? null,
      artifact: body.artifact ?? null,
      expectedVersion: body.expectedVersion ?? null,
    });
    const replay = state.idempotency.get(idempotencyKey);
    if (replay) {
      if (replay.canonical !== canonical) return jsonResponse(409, errorBody("conflict", "idempotency key was reused with a different body"));
      return jsonResponse(200, replay.response);
    }
    if ((body.kind === "resolved" || body.kind === "reopened") && body.expectedVersion !== state.project.version) {
      return jsonResponse(409, errorBody("version_conflict", "expectedVersion does not match the current project version"));
    }
    const nowIso = iso(clock());
    const event = {
      id: `ev_synthetic_${state.events.length + 1}`,
      projectId: SYNTHETIC_PROJECT_ID,
      sequence: state.events.length + 1,
      kind: body.kind,
      createdAt: nowIso,
    };
    if (typeof body.text === "string") event.text = body.text;
    if (body.artifact) {
      stats.artifactUrlStored += 1;
      event.artifact = { url: body.artifact.url, ...(body.artifact.label ? { label: body.artifact.label } : {}) };
    }
    applyEvent(body.kind, nowIso);
    state.events.push(event);
    const response = { event: cloneEvent(event), project: { ...state.project } };
    state.idempotency.set(idempotencyKey, { canonical, response });
    return jsonResponse(201, response);
  }

  return {
    label: SYNTHETIC_FIXTURE_LABEL,
    synthetic: true,
    origin: SYNTHETIC_ORIGIN,
    projectId: SYNTHETIC_PROJECT_ID,
    writerToken: SYNTHETIC_GRANT_TOKEN,
    readerToken: SYNTHETIC_READER_TOKEN,
    expiredToken: SYNTHETIC_EXPIRED_TOKEN,
    revokedToken: SYNTHETIC_REVOKED_TOKEN,
    shortLivedToken: SYNTHETIC_SHORT_TOKEN,
    fetch: fetchImpl,
    stats,
    arm(mode) {
      armed = mode;
    },
  };
}

function cloneEvent(event) {
  return {
    ...event,
    artifact: event.artifact ? { ...event.artifact } : undefined,
  };
}

function bearer(init) {
  const value = header(init, "Authorization");
  const match = /^Bearer\s+(\S+)$/i.exec(value);
  return match ? match[1] : "";
}

function header(init, name) {
  const headers = init.headers;
  if (!headers) return "";
  if (typeof headers.get === "function") return headers.get(name) || "";
  const key = Object.keys(headers).find((item) => item.toLowerCase() === name.toLowerCase());
  return key ? String(headers[key]) : "";
}
