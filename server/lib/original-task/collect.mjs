import { hashRequest } from "../../../vendor/visitor-foundry-receiver/services/correspondence/dist/crypto.js";
import { classifyThread, dispositionRequest, OriginalTaskError } from "./envelope.mjs";

const PAGE = 100;

async function eventsOf(store, projectId) {
  const events = [];
  let after = 0;
  for (let page = 0; page < 5; page += 1) {
    const result = await store.listEvents({ projectId, afterSequence: after, limit: PAGE });
    events.push(...result.events);
    if (result.events.length < PAGE) break;
    after = result.events.at(-1).sequence;
  }
  return events;
}

async function replyProjectIds(store) {
  if (store.kind === "postgres") {
    const result = await store.query(
      `SELECT id FROM correspondence_projects
       WHERE next_action_kind = 'reply'
       ORDER BY updated_at ASC
       LIMIT 101`,
    );
    const ids = result.rows.map((row) => row.id);
    return { ids: ids.slice(0, 100), truncated: ids.length > 100 };
  }
  if (store.kind === "memory" && store.state?.projects) {
    const ids = [...store.state.projects.values()]
      .filter((project) => project.nextAction?.kind === "reply")
      .sort((left, right) => (left.updatedAt < right.updatedAt ? -1 : left.updatedAt > right.updatedAt ? 1 : 0))
      .map((project) => project.id);
    return { ids: ids.slice(0, 100), truncated: ids.length > 100 };
  }
  throw new OriginalTaskError("store_unavailable", 503);
}

function grantExpired(grant, now) {
  const revoked = grant.revokedAt || grant.revoked_at;
  if (revoked) return true;
  const expires = grant.expiresAt || grant.expires_at;
  return Boolean(expires) && new Date(expires).getTime() <= now;
}

async function accessOf(store, projectId, now) {
  let grants = [];
  let registrationId = null;
  let workspaceExpired = false;
  if (store.kind === "postgres") {
    const grantRows = await store.query(
      `SELECT role, expires_at, revoked_at FROM correspondence_grants WHERE project_id = $1`,
      [projectId],
    );
    grants = grantRows.rows;
    const rel = await store.query(`SELECT to_regclass('correspondence_vf10_registrations') AS rel`);
    if (rel.rows[0]?.rel) {
      const registration = await store.query(
        `SELECT id, expires_at FROM correspondence_vf10_registrations WHERE project_id = $1`,
        [projectId],
      );
      if (registration.rows[0]) {
        registrationId = registration.rows[0].id;
        workspaceExpired = new Date(registration.rows[0].expires_at).getTime() <= now;
      }
    }
  } else {
    grants = [...store.state.grants.values()].filter((grant) => grant.projectId === projectId);
  }
  const readers = grants.filter((grant) => grant.role === "reader");
  const retrieval = readers.length === 0 || readers.every((grant) => grantExpired(grant, now))
    ? (readers.length === 0 ? "no_reader" : "grant_expired")
    : "open";
  return { registrationId, retrieval, workspaceExpired };
}

async function idempotencyOf(store, projectId, key) {
  if (store.kind === "postgres") {
    const result = await store.query(
      `SELECT request_hash FROM correspondence_idempotency
       WHERE scope = 'event_create' AND project_id = $1 AND key = $2`,
      [projectId, key],
    );
    return result.rows[0] ? { requestHash: result.rows[0].request_hash } : null;
  }
  const row = store.state?.idempotency?.get(`event_create::${projectId}::${key}`);
  return row ? { requestHash: row.requestHash } : null;
}

export async function collectOriginalTasks(store, { now = Date.now } = {}) {
  const clock = typeof now === "function" ? now() : now;
  const { ids, truncated } = await replyProjectIds(store);
  const tasks = [];
  for (const projectId of ids) {
    const events = await eventsOf(store, projectId);
    const access = await accessOf(store, projectId, clock);
    const view = classifyThread(events, access);
    if (!view || view.triaged) continue;
    tasks.push({
      projectId,
      ...(access.registrationId ? { registrationId: access.registrationId } : {}),
      stage: view.stage,
      disposition: view.disposition,
      submitted: true,
      triaged: false,
      delivered: false,
      accepted: false,
      reused: false,
      published: false,
      exampleConsent: view.exampleConsent === true,
      laterTask: view.laterTask === true,
      retrieval: view.retrieval || access.retrieval,
      task: view.task,
    });
  }
  return {
    schema: "samedaydesk.original-task-collection.v1",
    onDemand: true,
    residentPoller: false,
    truncated,
    tasks,
  };
}

export async function writeOriginalTaskDisposition(store, { projectId, body, idempotencyKey, now = Date.now }) {
  if (!/^prj_[\w-]{16}$/.test(projectId || "")) throw new OriginalTaskError("not_found", 404);
  if (typeof idempotencyKey !== "string" || idempotencyKey.trim().length < 8 || idempotencyKey.length > 200) {
    throw new OriginalTaskError("invalid_input");
  }
  const key = idempotencyKey.trim();
  const disposition = dispositionRequest(body);
  const requestBody = { kind: "reply", text: disposition.text };
  const requestHash = hashRequest(requestBody);
  const existing = await idempotencyOf(store, projectId, key);
  if (existing && existing.requestHash !== requestHash) throw new OriginalTaskError("idempotency_conflict", 409);
  if (!existing) {
    let events;
    try { events = await eventsOf(store, projectId); }
    catch (error) {
      if (error?.status === 404) throw new OriginalTaskError("not_found", 404);
      throw error;
    }
    const clock = typeof now === "function" ? now() : now;
    const access = await accessOf(store, projectId, clock);
    const view = classifyThread(events, access);
    if (!view) throw new OriginalTaskError("not_task_bearing", 404);
    if (view.disposition === "withdrawn") throw new OriginalTaskError("withdrawn", 409);
    if (view.disposition === "expired") throw new OriginalTaskError("workspace_expired", 409);
    if (view.triaged) throw new OriginalTaskError("already_disposed", 409);
  }
  const written = await store.createEvent({
    projectId,
    kind: "reply",
    text: disposition.text,
    idempotencyKey: key,
    requestHash,
  });
  return {
    schema: disposition.body.schema,
    projectId,
    disposition: disposition.body.disposition,
    stage: "triaged",
    submitted: true,
    triaged: true,
    delivered: false,
    accepted: false,
    reused: false,
    published: false,
    replayed: written.replayed === true,
    eventId: written.event.id,
    sequence: written.event.sequence,
  };
}
