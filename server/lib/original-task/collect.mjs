import { hashRequest, newId } from "../../../vendor/visitor-foundry-receiver/services/correspondence/dist/crypto.js";
import { applyEventToProject } from "../../../vendor/visitor-foundry-receiver/services/correspondence/dist/project-state.js";
import { classifyThread, dispositionRequest, OriginalTaskError } from "./envelope.mjs";

const PAGE = 100;
const PROJECT_LIMIT = 100;
const EVENT_BUDGET = 500;
const EVENT_SAFETY = 5000;
const FOLLOW_ROUNDS = 8;
const memoryLocks = new WeakMap();

async function readThread(list, projectId, allowance) {
  const events = [];
  let after = 0;
  const budget = Math.min(allowance, EVENT_SAFETY);
  while (events.length < budget) {
    const limit = Math.min(PAGE, budget - events.length);
    const result = await list(projectId, after, limit);
    events.push(...result);
    if (result.length < limit) return { events, complete: true, after: events.at(-1)?.sequence ?? after };
    after = result.at(-1).sequence;
  }
  const more = await list(projectId, after, 1);
  if (more.length === 0) return { events, complete: true, after };
  return { events, complete: false, after };
}

function listFromStore(store) {
  return async (projectId, after, limit) => {
    const result = await store.listEvents({ projectId, afterSequence: after, limit });
    return result.events;
  };
}

async function eventsOf(store, projectId) {
  const thread = await readThread(listFromStore(store), projectId, EVENT_SAFETY);
  if (!thread.complete) throw new OriginalTaskError("incomplete", 409);
  return thread.events;
}

function encodeCursor(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  let value;
  try { value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")); }
  catch { throw new OriginalTaskError("invalid_cursor", 400); }
  if (!value || typeof value.projectId !== "string" || typeof value.updatedAt !== "string" ||
      !Number.isInteger(value.eventAfter) || value.eventAfter < 0) {
    throw new OriginalTaskError("invalid_cursor", 400);
  }
  return value;
}

async function projectPage(store, after, limit) {
  if (store.kind === "postgres") {
    const result = await store.query(
      `SELECT id, to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') AS updated_at
       FROM correspondence_projects
       WHERE next_action_kind = 'reply'
         AND ($1::text IS NULL OR (updated_at AT TIME ZONE 'UTC', id) > ($1::timestamp, $2))
       ORDER BY updated_at ASC, id ASC
       LIMIT $3`,
      [after?.updatedAt ?? null, after?.projectId ?? "", limit + 1],
    );
    const rows = result.rows.map((row) => ({ id: row.id, updatedAt: row.updated_at, eventAfter: 0 }));
    return { rows: rows.slice(0, limit), more: rows.length > limit };
  }
  if (store.kind === "memory" && store.state?.projects) {
    let rows = [...store.state.projects.values()]
      .filter((project) => project.nextAction?.kind === "reply")
      .map((project) => ({ id: project.id, updatedAt: project.updatedAt, eventAfter: 0 }))
      .sort((left, right) => (left.updatedAt < right.updatedAt ? -1 : left.updatedAt > right.updatedAt ? 1 : left.id < right.id ? -1 : 1));
    if (after) {
      rows = rows.filter((row) => row.updatedAt > after.updatedAt ||
        (row.updatedAt === after.updatedAt && row.id > after.projectId));
    }
    return { rows: rows.slice(0, limit), more: rows.length > limit };
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

function collectionBody(tasks, { complete, nextCursor }) {
  return {
    schema: "samedaydesk.original-task-collection.v1",
    onDemand: true,
    residentPoller: false,
    complete,
    truncated: complete === false,
    nextCursor,
    tasks,
  };
}

export async function collectOriginalTasks(store, {
  now = Date.now,
  cursor = null,
  projectLimit = PROJECT_LIMIT,
  eventBudget = EVENT_BUDGET,
} = {}) {
  const clock = typeof now === "function" ? now() : now;
  const decoded = decodeCursor(cursor);
  const tasks = [];
  const slots = [];
  if (decoded?.eventAfter > 0) {
    slots.push({ id: decoded.projectId, updatedAt: decoded.updatedAt, eventAfter: decoded.eventAfter });
  }
  const page = await projectPage(
    store,
    decoded ? { updatedAt: decoded.updatedAt, projectId: decoded.projectId } : null,
    Math.max(0, projectLimit - slots.length),
  );
  slots.push(...page.rows);
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];
    const allowance = (slot.eventAfter || 0) + eventBudget;
    let thread;
    try {
      thread = await readThread(listFromStore(store), slot.id, allowance);
    } catch (error) {
      if (error?.status === 404) continue;
      throw error;
    }
    if (!thread.complete) {
      return collectionBody(tasks, {
        complete: false,
        nextCursor: encodeCursor({ projectId: slot.id, updatedAt: slot.updatedAt, eventAfter: thread.after }),
      });
    }
    const access = await accessOf(store, slot.id, clock);
    const view = classifyThread(thread.events, access);
    if (!view || view.triaged) continue;
    tasks.push({
      projectId: slot.id,
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
  if (page.more) {
    const last = slots.at(-1);
    return collectionBody(tasks, {
      complete: false,
      nextCursor: encodeCursor({ projectId: last.id, updatedAt: last.updatedAt, eventAfter: 0 }),
    });
  }
  return collectionBody(tasks, { complete: true, nextCursor: null });
}

export async function receiveOriginalTasks(store, { cursor = null, now = Date.now } = {}) {
  const tasks = [];
  let next = cursor;
  for (let round = 0; round < FOLLOW_ROUNDS; round += 1) {
    const page = await collectOriginalTasks(store, { cursor: next, now });
    tasks.push(...page.tasks);
    if (page.complete) return collectionBody(tasks, { complete: true, nextCursor: null });
    next = page.nextCursor;
  }
  return collectionBody(tasks, { complete: false, nextCursor: next });
}

function justify(events, access) {
  const view = classifyThread(events, access);
  if (!view) throw new OriginalTaskError("not_task_bearing", 404);
  if (view.disposition === "withdrawn") throw new OriginalTaskError("withdrawn", 409);
  if (view.disposition === "expired") throw new OriginalTaskError("workspace_expired", 409);
  if (view.triaged) throw new OriginalTaskError("already_disposed", 409);
  return view;
}

function dispositionResult(disposition, projectId, written) {
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

function withMemoryLock(store, projectId, fn) {
  let locks = memoryLocks.get(store);
  if (!locks) {
    locks = new Map();
    memoryLocks.set(store, locks);
  }
  const previous = locks.get(projectId) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  locks.set(projectId, run.then(() => {}, () => {}));
  return run;
}

async function projectRow(client, projectId) {
  const result = await client.query(`SELECT * FROM correspondence_projects WHERE id = $1 FOR UPDATE`, [projectId]);
  const row = result.rows[0];
  if (!row) throw new OriginalTaskError("not_found", 404);
  return {
    version: Number(row.version),
    project: {
      id: row.id,
      title: row.title,
      summary: row.summary,
      status: row.status,
      version: Number(row.version),
      nextAction: row.next_action_kind
        ? (row.next_action_url ? { kind: row.next_action_kind, url: row.next_action_url } : { kind: row.next_action_kind })
        : null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    },
  };
}

async function commitPostgres(store, ctx) {
  const client = await store.connectScoped();
  try {
    await client.query("BEGIN");
    try {
      const locked = await projectRow(client, ctx.projectId);
      const existing = await client.query(
        `SELECT request_hash, response_json FROM correspondence_idempotency
         WHERE scope = 'event_create' AND project_id = $1 AND key = $2 FOR UPDATE`,
        [ctx.projectId, ctx.key],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].request_hash !== ctx.requestHash) throw new OriginalTaskError("idempotency_conflict", 409);
        await client.query("COMMIT");
        return { replayed: true, event: existing.rows[0].response_json.event };
      }
      if (locked.version !== ctx.version) throw new OriginalTaskError("version_conflict", 409);
      const thread = await readThread(
        async (projectId, after, limit) => {
          const result = await client.query(
            `SELECT id, project_id, sequence, kind, text, created_at
             FROM correspondence_events
             WHERE project_id = $1 AND sequence > $2
             ORDER BY sequence ASC
             LIMIT $3`,
            [projectId, after, limit],
          );
          return result.rows.map((row) => ({
            id: row.id,
            projectId: row.project_id,
            sequence: Number(row.sequence),
            kind: row.kind,
            ...(row.text ? { text: row.text } : {}),
            createdAt: new Date(row.created_at).toISOString(),
          }));
        },
        ctx.projectId,
        EVENT_SAFETY,
      );
      if (!thread.complete) throw new OriginalTaskError("incomplete", 409);
      const access = await accessOf({ kind: "postgres", query: (text, params) => client.query(text, params) }, ctx.projectId, ctx.clock);
      justify(thread.events, access);
      const now = new Date();
      const nextProject = applyEventToProject(locked.project, "reply", ctx.version, now.toISOString());
      const sequence = (thread.events.at(-1)?.sequence ?? 0) + 1;
      const eventId = newId("evt");
      await client.query(
        `INSERT INTO correspondence_events (
           id, project_id, sequence, kind, text, artifact_url, artifact_label, created_at
         ) VALUES ($1,$2,$3,'reply',$4,NULL,NULL,$5)`,
        [eventId, ctx.projectId, sequence, ctx.text, now],
      );
      await client.query(
        `UPDATE correspondence_projects
         SET status = $1, version = $2, next_action_kind = $3, next_action_url = $4, updated_at = $5
         WHERE id = $6`,
        [
          nextProject.status,
          nextProject.version,
          nextProject.nextAction?.kind ?? null,
          nextProject.nextAction && "url" in nextProject.nextAction ? nextProject.nextAction.url ?? null : null,
          now,
          ctx.projectId,
        ],
      );
      const event = {
        id: eventId,
        projectId: ctx.projectId,
        sequence,
        kind: "reply",
        text: ctx.text,
        createdAt: now.toISOString(),
      };
      await client.query(
        `INSERT INTO correspondence_idempotency (
           scope, project_id, key, request_hash, status_code, response_json, created_at
         ) VALUES ('event_create',$1,$2,$3,201,$4::jsonb,$5)`,
        [ctx.projectId, ctx.key, ctx.requestHash, JSON.stringify({ event, project: nextProject }), now],
      );
      await client.query("COMMIT");
      return { replayed: false, event };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    }
  } finally {
    client.release();
  }
}

async function commitMemory(store, ctx) {
  return withMemoryLock(store, ctx.projectId, async () => {
    const again = await idempotencyOf(store, ctx.projectId, ctx.key);
    if (again?.requestHash === ctx.requestHash) {
      const written = await store.createEvent(ctx.eventInput);
      return { replayed: true, event: written.event };
    }
    if (again) throw new OriginalTaskError("idempotency_conflict", 409);
    const project = await store.getProject(ctx.projectId);
    if (!project) throw new OriginalTaskError("not_found", 404);
    if (Number(project.version) !== ctx.version) throw new OriginalTaskError("version_conflict", 409);
    const events = await eventsOf(store, ctx.projectId);
    const access = await accessOf(store, ctx.projectId, ctx.clock);
    justify(events, access);
    const written = await store.createEvent(ctx.eventInput);
    return { replayed: written.replayed === true, event: written.event };
  });
}

export async function writeOriginalTaskDisposition(store, {
  projectId,
  body,
  idempotencyKey,
  now = Date.now,
  beforeAppend,
} = {}) {
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
  const eventInput = { projectId, kind: "reply", text: disposition.text, idempotencyKey: key, requestHash };
  if (existing) {
    const written = await store.createEvent(eventInput);
    return dispositionResult(disposition, projectId, written);
  }
  const project = await store.getProject(projectId);
  if (!project) throw new OriginalTaskError("not_found", 404);
  const version = Number(project.version);
  let events;
  try { events = await eventsOf(store, projectId); }
  catch (error) {
    if (error?.status === 404) throw new OriginalTaskError("not_found", 404);
    throw error;
  }
  const clock = typeof now === "function" ? now() : now;
  const access = await accessOf(store, projectId, clock);
  justify(events, access);
  if (beforeAppend) await beforeAppend();
  const ctx = { projectId, key, requestHash, text: disposition.text, version, clock, eventInput };
  try {
    const written = store.kind === "postgres" ? await commitPostgres(store, ctx) : await commitMemory(store, ctx);
    return dispositionResult(disposition, projectId, written);
  } catch (error) {
    if (error instanceof OriginalTaskError) throw error;
    if (error?.code === "version_conflict") throw new OriginalTaskError("version_conflict", 409);
    if (error?.status === 404) throw new OriginalTaskError("not_found", 404);
    throw error;
  }
}
