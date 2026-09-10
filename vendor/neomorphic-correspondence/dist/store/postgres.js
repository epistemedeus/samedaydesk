import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { ApiError } from "../errors.js";
import { newId } from "../crypto.js";
import { parsePgSchema, parsePoolMax, quoteIdent } from "../config.js";
import { requireBootstrapReplay } from "../bootstrap-replay.js";
import { applyEventToProject, encodeCursor, projectPublic } from "../project-state.js";
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migrationPath = path.join(rootDir, "migrations/001_init.sql");
function toIso(value) {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
function nextActionFromRow(row) {
    if (!row.next_action_kind)
        return null;
    return row.next_action_url
        ? { kind: row.next_action_kind, url: row.next_action_url }
        : { kind: row.next_action_kind };
}
function projectFromRow(row) {
    return projectPublic({
        id: row.id,
        title: row.title,
        summary: row.summary,
        status: row.status,
        version: row.version,
        nextAction: nextActionFromRow(row),
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
    });
}
function eventFromRow(row) {
    const event = {
        id: row.id,
        projectId: row.project_id,
        sequence: Number(row.sequence),
        kind: row.kind,
        createdAt: toIso(row.created_at),
    };
    if (row.text)
        event.text = row.text;
    if (row.artifact_url) {
        event.artifact = row.artifact_label
            ? { url: row.artifact_url, label: row.artifact_label }
            : { url: row.artifact_url };
    }
    return event;
}
export class PostgresStore {
    kind = "postgres";
    schema;
    schemaIdent;
    pool;
    constructor(databaseUrl, options = {}) {
        this.schema = parsePgSchema(options.schema);
        this.schemaIdent = quoteIdent(this.schema);
        const poolMax = parsePoolMax(options.poolMax == null ? undefined : String(options.poolMax), 4);
        this.pool = new pg.Pool({
            connectionString: databaseUrl,
            max: poolMax,
            idleTimeoutMillis: 10_000,
            connectionTimeoutMillis: 5_000,
            allowExitOnIdle: true,
        });
    }
    async connectScoped() {
        const client = await this.pool.connect();
        try {
            await client.query(`SET search_path TO ${this.schemaIdent}`);
            return client;
        }
        catch (error) {
            client.release();
            throw error;
        }
    }
    async query(text, params) {
        const client = await this.connectScoped();
        try {
            return await client.query(text, params);
        }
        finally {
            client.release();
        }
    }
    async migrate() {
        const sql = readFileSync(migrationPath, "utf8");
        const client = await this.pool.connect();
        try {
            await client.query(`CREATE SCHEMA IF NOT EXISTS ${this.schemaIdent}`);
            await client.query(`SET search_path TO ${this.schemaIdent}`);
            await client.query(sql);
        }
        finally {
            client.release();
        }
    }
    async close() {
        await this.pool.end();
    }
    async findActiveGrantByTokenHash(tokenHash) {
        const result = await this.query(`SELECT id, project_id, role, token_hash, expires_at, revoked_at, created_at
       FROM correspondence_grants
       WHERE token_hash = $1
       LIMIT 1`, [tokenHash]);
        const grant = result.rows[0];
        if (!grant)
            return null;
        if (grant.revoked_at)
            return null;
        if (grant.expires_at && grant.expires_at.getTime() <= Date.now())
            return null;
        return {
            id: grant.id,
            projectId: grant.project_id,
            role: grant.role,
            expiresAt: grant.expires_at ? toIso(grant.expires_at) : null,
        };
    }
    async getProject(projectId) {
        const result = await this.query(`SELECT * FROM correspondence_projects WHERE id = $1`, [projectId]);
        const row = result.rows[0];
        return row ? projectFromRow(row) : null;
    }
    async createProject(input) {
        const client = await this.connectScoped();
        try {
            await client.query("BEGIN");
            // An absent idempotency row cannot be locked with SELECT FOR UPDATE.
            await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`project_create:${input.idempotencyKey}`]);
            const existing = await client.query(`SELECT request_hash, status_code, response_json, created_at
         FROM correspondence_idempotency
         WHERE scope = 'project_create' AND project_id = '' AND key = $1
         FOR UPDATE`, [input.idempotencyKey]);
            if (existing.rows[0]) {
                if (existing.rows[0].request_hash !== input.requestHash) {
                    throw new ApiError(409, "idempotency_conflict", "Idempotency-Key was reused with a different body");
                }
                requireBootstrapReplay(existing.rows[0].created_at, existing.rows[0].response_json.ownerTokenHash, input.ownerTokenHash);
                await client.query("COMMIT");
                return {
                    project: existing.rows[0].response_json.project,
                    ownerToken: input.ownerTokenPlainForReplay,
                    replayed: true,
                    statusCode: existing.rows[0].status_code,
                };
            }
            const now = new Date();
            const projectId = newId("prj");
            const grantId = newId("grn");
            await client.query(`INSERT INTO correspondence_projects (
           id, title, summary, status, version, next_action_kind, next_action_url, created_at, updated_at
         ) VALUES ($1,$2,$3,'open',1,NULL,NULL,$4,$4)`, [projectId, input.title, input.summary, now]);
            await client.query(`INSERT INTO correspondence_grants (
           id, project_id, role, token_hash, expires_at, revoked_at, created_at
         ) VALUES ($1,$2,'owner',$3,NULL,NULL,$4)`, [grantId, projectId, input.ownerTokenHash, now]);
            const project = projectFromRow({
                id: projectId,
                title: input.title,
                summary: input.summary,
                status: "open",
                version: 1,
                next_action_kind: null,
                next_action_url: null,
                created_at: now,
                updated_at: now,
            });
            const response = {
                project,
                ownerTokenHash: input.ownerTokenHash,
            };
            await client.query(`INSERT INTO correspondence_idempotency (
           scope, project_id, key, request_hash, status_code, response_json, created_at
         ) VALUES ('project_create','',$1,$2,201,$3::jsonb,$4)`, [input.idempotencyKey, input.requestHash, JSON.stringify(response), now]);
            await client.query("COMMIT");
            return {
                project,
                ownerToken: input.ownerTokenPlainForReplay,
                replayed: false,
                statusCode: 201,
            };
        }
        catch (error) {
            await client.query("ROLLBACK");
            throw error;
        }
        finally {
            client.release();
        }
    }
    async createGrant(input) {
        const project = await this.getProject(input.projectId);
        if (!project)
            throw new ApiError(404, "not_found", "project not found");
        const now = new Date();
        const grant = {
            id: newId("grn"),
            projectId: input.projectId,
            role: input.role,
            tokenHash: input.tokenHash,
            expiresAt: input.expiresAt,
            revokedAt: null,
            createdAt: toIso(now),
        };
        await this.query(`INSERT INTO correspondence_grants (
         id, project_id, role, token_hash, expires_at, revoked_at, created_at
       ) VALUES ($1,$2,$3,$4,$5,NULL,$6)`, [grant.id, grant.projectId, grant.role, grant.tokenHash, grant.expiresAt, now]);
        return { grant, tokenIssuedAt: grant.createdAt };
    }
    async revokeGrant(projectId, grantId) {
        const result = await this.query(`SELECT * FROM correspondence_grants WHERE id = $1`, [grantId]);
        const grant = result.rows[0];
        if (!grant || grant.project_id !== projectId) {
            throw new ApiError(404, "not_found", "grant not found");
        }
        if (grant.revoked_at)
            return "already_revoked";
        await this.query(`UPDATE correspondence_grants SET revoked_at = $1 WHERE id = $2`, [new Date(), grantId]);
        return "revoked";
    }
    async createEvent(input) {
        const client = await this.connectScoped();
        try {
            await client.query("BEGIN");
            // Serialize by project before looking for a replay, including the first write.
            const projectResult = await client.query(`SELECT * FROM correspondence_projects WHERE id = $1 FOR UPDATE`, [input.projectId]);
            const row = projectResult.rows[0];
            if (!row)
                throw new ApiError(404, "not_found", "project not found");
            const existing = await client.query(`SELECT request_hash, status_code, response_json
         FROM correspondence_idempotency
         WHERE scope = 'event_create' AND project_id = $1 AND key = $2
         FOR UPDATE`, [input.projectId, input.idempotencyKey]);
            if (existing.rows[0]) {
                if (existing.rows[0].request_hash !== input.requestHash) {
                    throw new ApiError(409, "idempotency_conflict", "Idempotency-Key was reused with a different body");
                }
                await client.query("COMMIT");
                return {
                    event: existing.rows[0].response_json.event,
                    project: existing.rows[0].response_json.project,
                    replayed: true,
                    statusCode: existing.rows[0].status_code,
                };
            }
            const project = projectFromRow(row);
            const now = new Date();
            const nextProject = applyEventToProject(project, input.kind, input.expectedVersion, toIso(now));
            const sequenceResult = await client.query(`SELECT COALESCE(MAX(sequence), 0) AS sequence
         FROM correspondence_events WHERE project_id = $1`, [input.projectId]);
            const sequence = Number(sequenceResult.rows[0]?.sequence ?? 0) + 1;
            const eventId = newId("evt");
            await client.query(`INSERT INTO correspondence_events (
           id, project_id, sequence, kind, text, artifact_url, artifact_label, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [
                eventId,
                input.projectId,
                sequence,
                input.kind,
                input.text ?? null,
                input.artifact?.url ?? null,
                input.artifact?.label ?? null,
                now,
            ]);
            await client.query(`UPDATE correspondence_projects
         SET status = $1,
             version = $2,
             next_action_kind = $3,
             next_action_url = $4,
             updated_at = $5
         WHERE id = $6`, [
                nextProject.status,
                nextProject.version,
                nextProject.nextAction?.kind ?? null,
                nextProject.nextAction && "url" in nextProject.nextAction
                    ? nextProject.nextAction.url ?? null
                    : null,
                now,
                input.projectId,
            ]);
            const event = {
                id: eventId,
                projectId: input.projectId,
                sequence,
                kind: input.kind,
                createdAt: toIso(now),
            };
            if (input.text)
                event.text = input.text;
            if (input.artifact)
                event.artifact = input.artifact;
            const response = { event, project: nextProject };
            await client.query(`INSERT INTO correspondence_idempotency (
           scope, project_id, key, request_hash, status_code, response_json, created_at
         ) VALUES ('event_create',$1,$2,$3,201,$4::jsonb,$5)`, [input.projectId, input.idempotencyKey, input.requestHash, JSON.stringify(response), now]);
            await client.query("COMMIT");
            return {
                event,
                project: nextProject,
                replayed: false,
                statusCode: 201,
            };
        }
        catch (error) {
            await client.query("ROLLBACK");
            throw error;
        }
        finally {
            client.release();
        }
    }
    async listEvents(input) {
        const project = await this.getProject(input.projectId);
        if (!project)
            throw new ApiError(404, "not_found", "project not found");
        if (input.afterSequence > 0) {
            const cursorCheck = await this.query(`SELECT 1 FROM correspondence_events
         WHERE project_id = $1 AND sequence = $2`, [input.projectId, input.afterSequence]);
            if (cursorCheck.rowCount === 0) {
                throw new ApiError(400, "invalid_cursor", "cursor is not valid for this project");
            }
        }
        const result = await this.query(`SELECT * FROM correspondence_events
       WHERE project_id = $1 AND sequence > $2
       ORDER BY sequence ASC
       LIMIT $3`, [input.projectId, input.afterSequence, input.limit + 1]);
        const rows = result.rows;
        const events = rows.slice(0, input.limit).map(eventFromRow);
        const last = events.at(-1);
        return {
            events,
            nextCursor: last ? encodeCursor(input.projectId, last.sequence) : null,
        };
    }
}
export async function createPostgresStore(databaseUrl, options = {}) {
    const store = new PostgresStore(databaseUrl, options);
    await store.migrate();
    return store;
}
//# sourceMappingURL=postgres.js.map