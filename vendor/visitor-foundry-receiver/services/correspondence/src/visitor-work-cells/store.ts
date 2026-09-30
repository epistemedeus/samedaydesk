import { readFile } from "node:fs/promises";
import pg from "pg";
import { parsePgSchema, parsePoolMax, quoteIdent } from "../config.js";
import { hashRequest, hashToken, newId } from "../crypto.js";
import { encodeCursor } from "../project-state.js";
import { parseCursor, requireIdempotencyKey } from "../validation.js";
import {
  cellIdFor, fail, nextStep, parseCommand, verificationSchema, WorkCellError,
  type Cell, type Command, type Grant, type MutationReceipt, type ReceiptResolver,
} from "./contracts.js";

type Context = { projectId: string; token: string };
type GrantRow = { id: string; project_id: string; role: Grant["role"]; expires_at: Date | null; revoked_at: Date | null };
const receiptScope = (cellId: string) => `vf02:cell:${cellId}`;
const cursorScope = (projectId: string, cellId: string) => `vf02:${projectId}:${cellId}`;

export class WorkCellStore {
  readonly schema: string;
  private readonly ident: string;
  private readonly pool: pg.Pool;
  private inFlight = 0;
  constructor(databaseUrl: string, options: {
    schema: string; poolMax?: number; resolveReceipt?: ReceiptResolver;
  }) {
    this.schema = parsePgSchema(options.schema);
    this.ident = quoteIdent(this.schema);
    this.resolveReceipt = options.resolveReceipt;
    this.pool = new pg.Pool({ connectionString: databaseUrl,
      max: parsePoolMax(String(options.poolMax ?? 4)),
      connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000,
      statement_timeout: 3000, query_timeout: 4000, allowExitOnIdle: true,
      application_name: "neomorphic_vf02_work_cells",
    });
    this.pool.on("error", () => {}); // readiness fails without taking down the host
  }
  private readonly resolveReceipt?: ReceiptResolver;

  async migrate(): Promise<void> {
    const sql = await readFile(new URL("../../migrations/visitor-work-cells/001_vf02_work_cells.sql", import.meta.url), "utf8");
    await this.tx(async (client) => {
      // Migration-only schema lock; never on ordinary work-cell transitions.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`vf02:migrate:${this.schema}`]);
      await client.query(sql);
    });
  }
  async close(): Promise<void> { await this.pool.end(); }
  async checkReady(): Promise<void> {
    await this.tx(async (c) => { await c.query("SELECT 1 FROM correspondence_vf02_work_cells LIMIT 0"); });
  }

  private async tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    if (this.inFlight >= 128) fail(503, "busy", "bounded work-cell queue is full", "retry identical key/body with jitter", 1);
    this.inFlight++;
    let client: pg.PoolClient | undefined;
    let broken = false;
    try {
      client = await this.pool.connect();
      await client.query("BEGIN");
      await client.query(`SET LOCAL search_path TO ${this.ident}`);
      await client.query("SET LOCAL lock_timeout = '1500ms'");
      await client.query("SET LOCAL idle_in_transaction_session_timeout = '5000ms'");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      if (client) await client.query("ROLLBACK").catch(() => { broken = true; });
      if (error instanceof WorkCellError) throw error;
      // Includes ambiguous connection loss at COMMIT: exact replay is safe.
      return fail(503, "unavailable", "work-cell transaction unavailable or outcome unknown", "retry identical key/body; reload before changing the request", 1);
    } finally {
      client?.release(broken);
      this.inFlight--;
    }
  }

  private async now(c: pg.PoolClient): Promise<Date> {
    return (await c.query<{ now: Date }>("SELECT clock_timestamp() AS now")).rows[0]!.now;
  }
  private async authorize(c: pg.PoolClient, context: Context, write: boolean): Promise<Grant> {
    const rows = await c.query<GrantRow>(
      "SELECT * FROM correspondence_grants WHERE token_hash = $1 FOR SHARE", [hashToken(context.token)]);
    const row = rows.rows[0];
    const now = await this.now(c);
    if (!row || row.revoked_at || (row.expires_at && row.expires_at <= now)) {
      fail(401, "unauthorized", "invalid grant", "obtain a fresh project-scoped grant; do not replay with another identity");
    }
    if (row.project_id !== context.projectId) fail(404, "not_found", "project not found", "use the project named by your grant");
    if (write && row.role === "reader") fail(403, "forbidden", "writer or owner grant required", "request a writer grant for optional contribution");
    return { id: row.id, projectId: row.project_id, role: row.role, expiresAt: row.expires_at?.toISOString() ?? null };
  }
  private async activeLease(c: pg.PoolClient, cell: Cell, now: Date): Promise<boolean> {
    if (!cell.lease || Date.parse(cell.lease.expiresAt) <= +now) return false;
    const r = await c.query<GrantRow>("SELECT * FROM correspondence_grants WHERE project_id=$1 AND id=$2",
      [cell.projectId, cell.lease.grantId]);
    const g = r.rows[0];
    return !!g && !g.revoked_at && (!g.expires_at || g.expires_at > now) && g.role !== "reader";
  }
  private async requireFence(c: pg.PoolClient, cell: Cell, actor: Grant, fence: number | undefined, now: Date): Promise<void> {
    if (cell.status !== "leased" || !cell.lease || cell.lease.grantId !== actor.id ||
        cell.lease.fence !== fence || !(await this.activeLease(c, cell, now))) {
      fail(409, "stale_fence", "lease is expired, replaced or not held by this grant", "reload; claim only after release, expiry or revocation; never reuse an old fence");
    }
  }
  private lease(cell: Cell, grant: Grant, ttlSeconds: number, now: Date) {
    const expiry = Math.min(+now + ttlSeconds * 1000, grant.expiresAt ? Date.parse(grant.expiresAt) : Infinity);
    if (expiry <= +now) fail(401, "unauthorized", "grant expired", "obtain a fresh grant");
    return { grantId: grant.id, fence: cell.fence, expiresAt: new Date(expiry).toISOString() };
  }

  // installedClient is an in-process host transaction seam; HTTP never accepts it.
  async mutate(context: Context, cellId: string | null, raw: unknown, rawKey: string, installedClient?: pg.PoolClient) {
    const command = parseCommand(raw);
    let key: string;
    try { key = requireIdempotencyKey(rawKey); } catch {
      fail(400, "invalid_input", "Idempotency-Key must contain 8–200 characters", "persist a key before making the request");
    }
    if (command.action === "create") {
      if (cellId !== null) fail(400, "invalid_input", "create uses the collection endpoint", "POST to work-cells");
      cellId = cellIdFor(context.projectId, command.gap.id, command.workScope);
    } else if (!cellId || !/^wcl_[a-f0-9]{64}$/.test(cellId)) {
      fail(400, "invalid_input", "invalid cell id", "use the cell id returned by create");
    }
    const id = cellId;
    const transact = installedClient ? <T>(fn: (c: pg.PoolClient) => Promise<T>) => fn(installedClient) : this.tx.bind(this);
    return transact(async (c) => {
      const actor = await this.authorize(c, context, true);
      // Compatible shared locks preserve project close/reopen ordering. Different
      // cells are not serialized against each other by this project read.
      const project = await c.query("SELECT status FROM correspondence_projects WHERE id=$1 FOR SHARE", [context.projectId]);
      if (!project.rows[0]) fail(404, "not_found", "project not found", "use an existing project");
      if (command.action === "create") {
        await c.query(`INSERT INTO correspondence_vf02_work_cells(project_id,id,gap_id,work_scope,revision,state)
          VALUES($1,$2,$3,$4,0,NULL) ON CONFLICT DO NOTHING`, [context.projectId, id, command.gap.id, command.workScope]);
      }
      const rows = await c.query<{ state: Cell | null; revision: number }>(
        "SELECT state,revision FROM correspondence_vf02_work_cells WHERE project_id=$1 AND id=$2 FOR UPDATE", [context.projectId, id]);
      const row = rows.rows[0];
      if (!row) fail(404, "not_found", "cell not found", "load a cell in your project");
      const requestHash = hashRequest({ actorGrantId: actor.id, command });
      const existing = await c.query<{ request_hash: string; response_json: MutationReceipt }>(
        "SELECT request_hash,response_json FROM correspondence_idempotency WHERE project_id=$1 AND scope=$2 AND key=$3",
        [context.projectId, receiptScope(id), key]);
      // Recheck expiry AFTER any row wait, including before an exact retry.
      let now = await this.now(c);
      if (actor.expiresAt && Date.parse(actor.expiresAt) <= +now) fail(401, "unauthorized", "grant expired during wait", "obtain a fresh scoped grant");
      if (existing.rows[0]) {
        if (existing.rows[0].request_hash !== requestHash) fail(409, "idempotency_conflict", "key is bound to a different body or grant", "restore original key/body/grant, or use a new key for a new intent");
        return { receipt: existing.rows[0].response_json, replayed: true,
          nextStep: "historical receipt; GET current cell before using its revision or lease" };
      }
      if (row.revision !== command.expectedRevision) fail(409, "revision_conflict", "expectedRevision differs from current revision", "GET current cell, reconcile intent, then use a new key with its revision");
      if (project.rows[0].status === "resolved" && !["cancel", "release", "reject", "disposition"].includes(command.action)) {
        fail(409, "project_resolved", "project is resolved", "owner must reopen correspondence before new work");
      }
      const state: Cell = row.state ?? {
        schema: "neomorphic.foundry.work-cell.v1", id, projectId: context.projectId,
        gap: (command as Extract<Command, { action: "create" }>).gap,
        workScope: (command as Extract<Command, { action: "create" }>).workScope,
        revision: 0, fence: 0, status: "open", lease: null, checkpoint: null,
        contributorGrantIds: [], submission: null, disposition: null,
        createdAt: now.toISOString(), updatedAt: now.toISOString(),
      };
      if (state.revision >= 2_147_483_646 || state.fence >= 2_147_483_646) fail(409, "cell_exhausted", "cell counter exhausted", "create a new scope");
      await this.transition(c, state, command, actor, now);
      now = await this.now(c);
      if (actor.expiresAt && Date.parse(actor.expiresAt) <= +now) fail(401, "unauthorized", "grant expired before commit", "obtain a fresh grant; reload state");
      if (state.lease && Date.parse(state.lease.expiresAt) <= +now) fail(409, "stale_fence", "lease expired before commit", "reload state and claim with a new fence");
      state.revision++;
      state.updatedAt = now.toISOString();
      const receipt: MutationReceipt = { schema: "neomorphic.foundry.work-cell-receipt.v1",
        action: command.action, revision: state.revision, actorGrantId: actor.id,
        recordedAt: now.toISOString(), cell: state, nextStep: nextStep(state) };
      await c.query("UPDATE correspondence_vf02_work_cells SET revision=$3,state=$4::jsonb WHERE project_id=$1 AND id=$2",
        [context.projectId, id, state.revision, JSON.stringify(state)]);
      await c.query(`INSERT INTO correspondence_idempotency(scope,project_id,key,request_hash,status_code,response_json,created_at)
        VALUES($1,$2,$3,$4,201,$5::jsonb,$6)`, [receiptScope(id), context.projectId, key, requestHash, JSON.stringify(receipt), now]);
      return { receipt, replayed: false, nextStep: receipt.nextStep };
    });
  }

  private async transition(c: pg.PoolClient, cell: Cell, command: Command, actor: Grant, now: Date) {
    if (command.action === "create") return;
    if (["accepted", "cancelled", "rejected"].includes(cell.status)) fail(409, "terminal_cell", "cell has a terminal disposition", "read its disposition; use a new authorized scope for more work");
    if (["renew", "checkpoint", "transfer", "release", "submit"].includes(command.action)) {
      await this.requireFence(c, cell, actor, "fence" in command ? command.fence : undefined, now);
    }
    switch (command.action) {
      case "claim": {
        if (cell.status === "submitted") fail(409, "verification_pending", "candidate already submitted", "await disposition or cancel your submission");
        if (await this.activeLease(c, cell, now)) {
          fail(409, "lease_held", "cell already has a live lease", "wait until retry time, reload and claim with current revision", Math.max(1, Math.ceil((Date.parse(cell.lease!.expiresAt) - +now) / 1000)));
        }
        cell.fence++;
        cell.lease = this.lease(cell, actor, command.ttlSeconds, now);
        cell.status = "leased";
        break;
      }
      case "renew": cell.lease = this.lease(cell, actor, command.ttlSeconds, now); break;
      case "checkpoint":
        cell.checkpoint = { ...command.checkpoint, revision: cell.revision + 1, grantId: actor.id, createdAt: now.toISOString() };
        this.contributor(cell, actor.id);
        break;
      case "transfer": {
        if (!cell.checkpoint) fail(409, "checkpoint_required", "transfer needs a durable checkpoint", "checkpoint before transferring");
        const r = await c.query<GrantRow>("SELECT * FROM correspondence_grants WHERE project_id=$1 AND id=$2 FOR SHARE", [cell.projectId, command.targetGrantId]);
        const target = r.rows[0];
        const transferNow = await this.now(c);
        if (!target || target.role === "reader" || target.revoked_at || target.id === actor.id || (target.expires_at && target.expires_at <= transferNow)) {
          fail(403, "invalid_target_grant", "transfer target must be a different active writer or owner in this project", "owner issues a new project-scoped session grant");
        }
        await this.requireFence(c, cell, actor, command.fence, transferNow);
        cell.fence++;
        cell.lease = this.lease(cell, { id: target.id, projectId: target.project_id, role: target.role, expiresAt: target.expires_at?.toISOString() ?? null }, command.ttlSeconds, transferNow);
        break;
      }
      case "release": cell.status = "open"; cell.lease = null; break;
      case "submit": {
        const input = command.contribution;
        if (!cell.checkpoint || input.checkpointRevision !== cell.checkpoint.revision ||
          input.gapId !== cell.gap.id || input.gapRevision !== cell.gap.contentId) {
          fail(409, "candidate_mismatch", "candidate must bind the exact gap and retained checkpoint", "reload checkpoint/gap and correct the submission");
        }
        this.contributor(cell, actor.id);
        cell.submission = { id: newId("sub"), revision: cell.revision + 1, grantId: actor.id,
          contributorGrantIds: [...cell.contributorGrantIds], submittedAt: now.toISOString(), contribution: input };
        cell.status = "submitted"; cell.lease = null;
        break;
      }
      case "cancel":
        if (actor.role !== "owner") {
          if (cell.status === "submitted") {
            if (cell.submission?.grantId !== actor.id) fail(403, "forbidden", "only submitter or owner may cancel", "ask project owner");
          } else await this.requireFence(c, cell, actor, command.fence, now);
        }
        cell.status = "cancelled"; cell.lease = null;
        cell.disposition = { source: actor.role === "owner" ? "owner" : "contributor", reason: command.reason };
        break;
      case "reject":
        if (actor.role !== "owner") fail(403, "forbidden", "owner rejection requires owner grant", "await independent disposition");
        cell.status = "rejected"; cell.lease = null;
        cell.disposition = { source: "owner", reason: command.reason };
        break;
      case "disposition": {
        if (actor.role !== "owner") fail(403, "forbidden", "only host owner may attach verified disposition", "await independent verification");
        if (!cell.submission || cell.status !== "submitted") fail(409, "not_submitted", "no pending submission", "submit a candidate before verification");
        if (cell.submission.contributorGrantIds.includes(actor.id)) fail(403, "self_disposition", "contributor grant cannot disposition its own candidate", "use independently authorized host verification; another alias alone does not prove independence");
        if (!this.resolveReceipt) fail(503, "verification_unconfigured", "trusted receipt resolver is not configured", "Heavy must wire VF03 trusted receipt admission; keep submission pending");
        let timer: NodeJS.Timeout | undefined;
        const controller = new AbortController();
        let raw: unknown;
        try {
          raw = await Promise.race([
            this.resolveReceipt({ reference: command.receipt, projectId: cell.projectId,
              cellId: cell.id, submission: structuredClone(cell.submission), signal: controller.signal }),
            new Promise((_, reject) => { timer = setTimeout(() => {
              controller.abort(); reject(new WorkCellError(503, "verification_busy", "receipt lookup timed out", "retry identical key/body with jitter", 1));
            }, 750); }),
          ]);
        } finally { clearTimeout(timer); }
        const parsed = verificationSchema.safeParse(raw);
        if (!parsed.success) fail(409, "invalid_receipt", "trusted receipt envelope is invalid", "ask verifier to supply an admitted receipt");
        const receipt = parsed.data;
        if (receipt.projectId !== cell.projectId || receipt.cellId !== cell.id || receipt.submissionId !== cell.submission.id ||
          receipt.candidateRevision !== cell.submission.contribution.sourceRevision || receipt.artifactDigest !== cell.submission.contribution.artifact.digest ||
          cell.submission.contributorGrantIds.includes(receipt.executionIdentity)) {
          fail(409, "receipt_mismatch", "receipt does not independently bind this exact candidate", "obtain independently assigned verification for this submission");
        }
        cell.disposition = { source: "verification", receipt: command.receipt, verification: receipt };
        cell.status = receipt.outcome === "deferred" ? "submitted" : receipt.outcome;
        break;
      }
    }
  }
  private contributor(cell: Cell, id: string) {
    if (!cell.contributorGrantIds.includes(id)) {
      if (cell.contributorGrantIds.length >= 32) fail(409, "handoff_limit", "cell has 32 contributing sessions", "start a new authorized scope with the retained checkpoint");
      cell.contributorGrantIds.push(id);
    }
  }

  async get(context: Context, cellId: string) {
    return this.tx(async (c) => {
      await this.authorize(c, context, false);
      const r = await c.query<{ state: Cell }>("SELECT state FROM correspondence_vf02_work_cells WHERE project_id=$1 AND id=$2", [context.projectId, cellId]);
      const cell = r.rows[0]?.state;
      if (!cell) fail(404, "not_found", "cell not found", "use a cell in the authorized project");
      const now = await this.now(c);
      return { cell, leaseLive: await this.activeLease(c, cell, now), observedAt: now.toISOString(), nextStep: nextStep(cell) };
    });
  }

  async replay(context: Context, cellId: string, after: unknown = undefined, limit = 25) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) fail(400, "invalid_input", "limit must be 1–50", "request a bounded page");
    let sequence: number;
    try { sequence = parseCursor(after, cursorScope(context.projectId, cellId)); } catch {
      fail(400, "invalid_cursor", "cursor is not valid for this cell", "use the cursor returned for this project and cell");
    }
    return this.tx(async (c) => {
      await this.authorize(c, context, false);
      const r = await c.query<{ revision: number }>("SELECT revision FROM correspondence_vf02_work_cells WHERE project_id=$1 AND id=$2", [context.projectId, cellId]);
      const revision = r.rows[0]?.revision;
      if (revision === undefined) fail(404, "not_found", "cell not found", "use an authorized cell");
      if (sequence > revision) fail(400, "invalid_cursor", "cursor is ahead of durable history", "resume from an existing receipt");
      const rows = await c.query<{ response_json: MutationReceipt }>(`SELECT response_json FROM correspondence_idempotency
        WHERE scope LIKE 'vf02:cell:%' AND project_id=$1 AND scope=$2
        AND (response_json->>'revision')::integer > $3 AND (response_json->>'revision')::integer <= $4
        ORDER BY (response_json->>'revision')::integer LIMIT $5`, [context.projectId, receiptScope(cellId), sequence, revision, limit + 1]);
      const receipts = rows.rows.slice(0, limit).map((r) => r.response_json);
      const last = receipts.at(-1)?.revision ?? sequence;
      return { schema: "neomorphic.foundry.work-cell-replay.v1", receipts, hasMore: rows.rows.length > limit,
        throughRevision: revision, nextCursor: last ? encodeCursor(cursorScope(context.projectId, cellId), last) : null };
    });
  }
}
