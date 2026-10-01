import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { parsePgSchema, parsePoolMax, quoteIdent } from "../config.js";
import { newId } from "../crypto.js";
import { addDecimal, decimalGte } from "../decimal.js";
import { ApiError } from "../errors.js";
import { asEvidenceBuffer } from "../evidence.js";
import { toOwedObligation } from "../obligation.js";
import { reconcilePayout } from "../payout.js";
import { ownerTask, publicTask } from "../redaction.js";
import { readBoundSpecDigest } from "../reproduction-verifier.js";
import { hashEarnedWorkTerms, publicTermsDocument, SCHEMA_VERSION } from "../terms-version.js";
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migrationPath = path.join(rootDir, "migrations/001_init.sql");
function toIso(value) {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
function isUniqueViolation(error) {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === "23505");
}
const TRANSIENT_PG_CODES = new Set([
    "ECONNRESET",
    "ECONNREFUSED",
    "EPIPE",
    "ETIMEDOUT",
    "ECONNABORTED",
    "57P01",
    "57P02",
    "57P03",
    "08000",
    "08001",
    "08003",
    "08004",
    "08006",
]);
/** Connection death after pg_ctl stop/restart — not a business-rule conflict. */
export function isTransientPgError(error) {
    if (!error || typeof error !== "object")
        return false;
    const code = "code" in error ? String(error.code ?? "") : "";
    if (TRANSIENT_PG_CODES.has(code))
        return true;
    const message = error instanceof Error ? error.message : String(error);
    return /connection terminated|connection closed|Client has encountered a connection error|server closed the connection|Query read timeout/i.test(message);
}
const OWNER_IDEMPOTENCY_PRINCIPAL = "owner";
function assertContributorTaskScope(contributor, taskId) {
    if (contributor.taskScope && contributor.taskScope !== taskId) {
        throw new ApiError(403, "forbidden", "contributor token is scoped to a different task");
    }
}
function assertExclusiveSlotLimit(slotLimit) {
    if (slotLimit !== 1) {
        throw new ApiError(400, "invalid_input", "this wave admits exclusive occupancy only (slotLimit must be 1)");
    }
}
function taskFromRow(row) {
    return {
        id: row.id,
        title: row.title,
        summary: row.summary,
        provenance: row.provenance,
        lifecycle: row.lifecycle,
        fundingState: row.funding_state,
        payoutState: row.payout_state,
        currentTermsVersion: row.current_terms_version,
        termsRevision: row.terms_revision,
        schemaVersion: row.schema_version,
        correctionMaxRevisions: row.correction_max_revisions,
        budget: {
            amount: row.budget_amount,
            asset: row.budget_asset,
            network: row.budget_network,
        },
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
    };
}
function termsFromRow(row) {
    return {
        version: row.version,
        schemaVersion: row.schema_version,
        termsRevision: row.terms_revision,
        summary: row.summary,
        reward: {
            amount: row.reward_amount,
            asset: row.reward_asset,
            network: row.reward_network,
        },
        claimTtlSeconds: row.claim_ttl_seconds,
        maxArtifactBytes: row.max_artifact_bytes,
        allowedMediaTypes: row.allowed_media_types,
        slotLimit: row.slot_limit,
        createdAt: toIso(row.created_at),
    };
}
function reservationFromRow(row) {
    return {
        id: row.id,
        taskId: row.task_id,
        termsVersion: row.terms_version,
        contributorPublicId: row.contributor_public_id,
        status: row.status,
        expiresAt: toIso(row.expires_at),
        createdAt: toIso(row.created_at),
    };
}
function submissionFromRow(row) {
    return {
        id: row.id,
        taskId: row.task_id,
        reservationId: row.reservation_id,
        termsVersion: row.terms_version,
        artifact: {
            ref: row.artifact_ref,
            digestSha256: row.artifact_digest_sha256,
            mediaType: row.artifact_media_type,
            bytes: row.artifact_bytes,
        },
        createdAt: toIso(row.created_at),
    };
}
function reasonsFrom(value) {
    if (Array.isArray(value))
        return value;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map(String) : [String(value)];
    }
    catch {
        return [String(value)];
    }
}
function verdictFromRow(row) {
    return {
        id: row.id,
        taskId: row.task_id,
        reservationId: row.reservation_id,
        submissionId: row.submission_id,
        termsVersion: row.terms_version,
        artifactDigestSha256: row.artifact_digest_sha256,
        verifierVersion: row.verifier_version,
        outcome: row.outcome,
        reasons: reasonsFrom(row.reasons),
        ordinal: Number(row.ordinal),
        createdAt: toIso(row.created_at),
    };
}
function obligationFromRow(row) {
    return toOwedObligation({
        id: row.id,
        taskId: row.task_id,
        reservationId: row.reservation_id,
        submissionId: row.submission_id,
        contributorPublicId: row.contributor_public_id,
        payoutDestination: row.payout_destination,
        reward: {
            amount: row.reward_amount,
            asset: row.reward_asset,
            network: row.reward_network,
        },
        termsVersion: row.terms_version ?? "",
        idempotencyKey: row.idempotency_key,
        createdAt: toIso(row.created_at),
        verdictId: row.verdict_id,
    });
}
export class PostgresStore {
    kind = "postgres";
    schema;
    schemaIdent;
    pool;
    clock;
    afterDurableWrite;
    constructor(databaseUrl, options = {}) {
        this.schema = parsePgSchema(options.schema);
        this.schemaIdent = quoteIdent(this.schema);
        this.clock = options.clock ?? (() => new Date());
        this.afterDurableWrite = options.afterDurableWrite;
        const poolMax = parsePoolMax(options.poolMax == null ? undefined : String(options.poolMax), 4);
        this.pool = new pg.Pool({
            connectionString: databaseUrl,
            max: poolMax,
            idleTimeoutMillis: 10_000,
            connectionTimeoutMillis: 5_000,
            statement_timeout: 5_000,
            query_timeout: 6_000,
            allowExitOnIdle: true,
            application_name: `ew_${this.schema}`.slice(0, 63),
        });
        this.pool.on("error", (error) => {
            console.error("earned_work_pool_error", { name: error.name });
        });
        this.pool.on("connect", (client) => {
            this.bindClientErrors(client);
        });
    }
    now() {
        return this.clock();
    }
    bindClientErrors(client) {
        const tagged = client;
        if (tagged.__ewErrorBound)
            return;
        tagged.__ewErrorBound = true;
        client.on("error", (error) => {
            console.error("earned_work_client_error", { name: error.name });
        });
    }
    destroyClient(client, error) {
        const flag = error instanceof Error ? error : true;
        try {
            client.release(flag);
        }
        catch {
            // Client is already gone.
        }
    }
    async withTransientRetry(fn, attempts = 4) {
        let last;
        for (let i = 0; i < attempts; i += 1) {
            try {
                return await fn();
            }
            catch (error) {
                last = error;
                if (!isTransientPgError(error) || i === attempts - 1)
                    throw error;
                await new Promise((resolve) => setTimeout(resolve, 75 * (i + 1)));
            }
        }
        throw last;
    }
    noteDurableWrite(kind) {
        this.afterDurableWrite?.({ kind });
    }
    /** Connection acquisition only. Dead clients are destroyed and the connect is retried. */
    async connectScoped() {
        return this.withTransientRetry(async () => {
            const client = await this.pool.connect();
            this.bindClientErrors(client);
            try {
                await client.query(`SET search_path TO ${this.schemaIdent}`);
                return client;
            }
            catch (error) {
                this.destroyClient(client, error);
                throw error;
            }
        });
    }
    /** Read path. Mutating SQL must not use this — a retry would replay the write. */
    async query(text, params) {
        if (/^\s*(INSERT|UPDATE|DELETE|MERGE)\b/i.test(text)) {
            throw new Error("mutating SQL must use executeUnfenced or withTx, not query()");
        }
        return this.withTransientRetry(async () => {
            const client = await this.connectScoped();
            try {
                const result = await client.query(text, params);
                client.release();
                return result;
            }
            catch (error) {
                this.destroyClient(client, error);
                throw error;
            }
        });
    }
    /**
     * Unfenced mutation (no durable idempotency). Retry connect, never replay the write
     * after a possible commit — ACK loss stays unknown rather than unique-violation remint.
     */
    async executeUnfenced(fn) {
        const client = await this.connectScoped();
        try {
            const result = await fn(client);
            this.noteDurableWrite("autocommit");
            client.release();
            return result;
        }
        catch (error) {
            this.destroyClient(client, error);
            throw error;
        }
    }
    /**
     * `idempotent`: load/save idempotency in the same TX — retry after COMMIT-uncertain is replay.
     * `read`: SELECT plus idempotent expire. `none`: never replay the callback after a possible COMMIT.
     */
    async withTx(fn, recover) {
        const runOnce = async () => {
            const client = await this.connectScoped();
            let failure;
            try {
                await client.query("BEGIN");
                const result = await fn(client);
                await client.query("COMMIT");
                this.noteDurableWrite("commit");
                return result;
            }
            catch (error) {
                failure = error;
                try {
                    await client.query("ROLLBACK");
                }
                catch {
                    // The original error is the one callers must see.
                }
                throw error;
            }
            finally {
                if (failure != null)
                    this.destroyClient(client, failure);
                else
                    client.release();
            }
        };
        if (recover === "none")
            return runOnce();
        return this.withTransientRetry(runOnce);
    }
    async migrate() {
        const sql = readFileSync(migrationPath, "utf8");
        const client = await this.pool.connect();
        this.bindClientErrors(client);
        try {
            await client.query("BEGIN");
            await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
                `earned_work_migrate:${this.schema}`,
            ]);
            await client.query(`CREATE SCHEMA IF NOT EXISTS ${this.schemaIdent}`);
            await client.query(`SET LOCAL search_path TO ${this.schemaIdent}`);
            await client.query(sql);
            await client.query(`
        ALTER TABLE earned_work_idempotency
          ADD COLUMN IF NOT EXISTS principal_id TEXT NOT NULL DEFAULT ''
      `);
            await client.query(`
        ALTER TABLE earned_work_obligations
          ADD COLUMN IF NOT EXISTS terms_version TEXT
      `);
            await client.query(`
        UPDATE earned_work_obligations o
        SET terms_version = r.terms_version
        FROM earned_work_reservations r
        WHERE o.reservation_id = r.id
          AND (o.terms_version IS NULL OR o.terms_version = '')
      `);
            await client.query(`
        ALTER TABLE earned_work_submissions
          ADD COLUMN IF NOT EXISTS evidence_bytes BYTEA
      `);
            await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conrelid = 'earned_work_submissions'::regclass
              AND conname = 'earned_work_submissions_evidence_bytes_check'
          ) THEN
            ALTER TABLE earned_work_submissions
              ADD CONSTRAINT earned_work_submissions_evidence_bytes_check
              CHECK (
                evidence_bytes IS NULL OR (
                  octet_length(evidence_bytes) >= 1
                  AND octet_length(evidence_bytes) <= 16384
                  AND octet_length(evidence_bytes) = artifact_bytes
                )
              );
          END IF;
        END $$
      `);
            await client.query(`
        DO $$
        DECLARE r record;
        BEGIN
          FOR r IN
            SELECT c.conname
            FROM pg_constraint c
            JOIN pg_class t ON c.conrelid = t.oid
            JOIN pg_namespace n ON t.relnamespace = n.oid
            WHERE n.nspname = current_schema()
              AND t.relname = 'earned_work_verdicts'
              AND c.contype = 'u'
              AND pg_get_constraintdef(c.oid) ILIKE '%verifier_version%'
          LOOP
            EXECUTE format('ALTER TABLE earned_work_verdicts DROP CONSTRAINT %I', r.conname);
          END LOOP;
        END $$
      `);
            await client.query(`
        DO $$
        DECLARE r record;
        BEGIN
          FOR r IN
            SELECT c.conname
            FROM pg_constraint c
            JOIN pg_class t ON c.conrelid = t.oid
            JOIN pg_namespace n ON t.relnamespace = n.oid
            WHERE n.nspname = current_schema()
              AND t.relname = 'earned_work_verdicts'
              AND c.contype = 'u'
              AND pg_get_constraintdef(c.oid) ~* 'UNIQUE \\(reservation_id\\)'
          LOOP
            EXECUTE format('ALTER TABLE earned_work_verdicts DROP CONSTRAINT %I', r.conname);
          END LOOP;
        END $$
      `);
            await client.query(`DROP INDEX IF EXISTS earned_work_verdicts_reservation_id_key`);
            await client.query(`ALTER TABLE earned_work_verdicts ADD COLUMN IF NOT EXISTS ordinal INTEGER`);
            await client.query(`
        UPDATE earned_work_verdicts v
        SET ordinal = sub.n
        FROM (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY reservation_id ORDER BY created_at, id) AS n
          FROM earned_work_verdicts
        ) sub
        WHERE v.id = sub.id AND v.ordinal IS NULL
      `);
            await client.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'earned_work_verdicts'
              AND column_name = 'ordinal'
              AND is_nullable = 'YES'
          ) THEN
            IF EXISTS (SELECT 1 FROM earned_work_verdicts WHERE ordinal IS NULL) THEN
              RAISE EXCEPTION 'earned_work_verdicts.ordinal backfill left nulls';
            END IF;
            ALTER TABLE earned_work_verdicts ALTER COLUMN ordinal SET NOT NULL;
          END IF;
        END $$
      `);
            await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conrelid = 'earned_work_verdicts'::regclass
              AND conname = 'earned_work_verdicts_reservation_id_ordinal_key'
          ) THEN
            ALTER TABLE earned_work_verdicts
              ADD CONSTRAINT earned_work_verdicts_reservation_id_ordinal_key
              UNIQUE (reservation_id, ordinal);
          END IF;
        END $$
      `);
            await client.query(`
        ALTER TABLE earned_work_obligations
          ADD COLUMN IF NOT EXISTS verdict_id TEXT
      `);
            await client.query(`
        UPDATE earned_work_obligations o
        SET verdict_id = v.id
        FROM (
          SELECT DISTINCT ON (reservation_id) id, reservation_id, submission_id
          FROM earned_work_verdicts
          WHERE outcome = 'pass'
          ORDER BY reservation_id, ordinal DESC, created_at DESC, id DESC
        ) v
        WHERE o.verdict_id IS NULL
          AND o.reservation_id = v.reservation_id
          AND o.submission_id = v.submission_id
      `);
            await client.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'earned_work_obligations'
              AND column_name = 'verdict_id'
              AND is_nullable = 'YES'
          ) THEN
            IF EXISTS (SELECT 1 FROM earned_work_obligations WHERE verdict_id IS NULL) THEN
              RAISE EXCEPTION 'earned_work_obligations.verdict_id backfill left nulls';
            END IF;
            ALTER TABLE earned_work_obligations ALTER COLUMN verdict_id SET NOT NULL;
          END IF;
        END $$
      `);
            await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conrelid = 'earned_work_obligations'::regclass
              AND conname = 'earned_work_obligations_verdict_id_key'
          ) THEN
            ALTER TABLE earned_work_obligations
              ADD CONSTRAINT earned_work_obligations_verdict_id_key UNIQUE (verdict_id);
          END IF;
        END $$
      `);
            await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conrelid = 'earned_work_obligations'::regclass
              AND conname = 'earned_work_obligations_verdict_id_fkey'
          ) THEN
            ALTER TABLE earned_work_obligations
              ADD CONSTRAINT earned_work_obligations_verdict_id_fkey
              FOREIGN KEY (verdict_id) REFERENCES earned_work_verdicts(id);
          END IF;
        END $$
      `);
            await client.query(`DROP INDEX IF EXISTS earned_work_reservations_active_contributor`);
            await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS earned_work_reservations_active_contributor
          ON earned_work_reservations (task_id, terms_version, contributor_token_id)
          WHERE status IN ('active', 'submitted')
      `);
            await client.query("COMMIT");
        }
        catch (error) {
            await client.query("ROLLBACK");
            throw error;
        }
        finally {
            client.release();
        }
    }
    async checkReady() {
        await this.query("SELECT 1");
    }
    async close() {
        await this.pool.end();
    }
    async loadIdempotency(client, scope, taskId, key, requestHash, principalId = OWNER_IDEMPOTENCY_PRINCIPAL) {
        const existing = await client.query(`SELECT request_hash, status_code, response_json, principal_id
       FROM earned_work_idempotency
       WHERE scope = $1 AND task_id = $2 AND key = $3
       FOR UPDATE`, [scope, taskId, key]);
        const row = existing.rows[0];
        if (!row)
            return { hit: false };
        // Empty principal_id is a pre-amendment owner row, not a contributor replay grant.
        const boundPrincipal = row.principal_id || OWNER_IDEMPOTENCY_PRINCIPAL;
        if (boundPrincipal !== principalId) {
            throw new ApiError(403, "forbidden", "idempotency key is bound to a different principal");
        }
        if (row.request_hash !== requestHash) {
            throw new ApiError(409, "idempotency_conflict", "Idempotency-Key was reused with a different body");
        }
        return { hit: true, statusCode: row.status_code, body: row.response_json };
    }
    async saveIdempotency(client, scope, taskId, key, requestHash, statusCode, body, now, principalId = OWNER_IDEMPOTENCY_PRINCIPAL) {
        await client.query(`INSERT INTO earned_work_idempotency (
         scope, task_id, key, request_hash, status_code, response_json, created_at, principal_id
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)`, [scope, taskId, key, requestHash, statusCode, JSON.stringify(body), now, principalId]);
    }
    async appendEvent(client, taskId, kind, payload, now) {
        const seq = await client.query(`SELECT COALESCE(MAX(sequence), 0) AS sequence FROM earned_work_events WHERE task_id = $1`, [taskId]);
        const sequence = Number(seq.rows[0]?.sequence ?? 0) + 1;
        await client.query(`INSERT INTO earned_work_events (id, task_id, sequence, kind, payload, created_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6)`, [newId("evt"), taskId, sequence, kind, JSON.stringify(payload), now]);
    }
    async lockTask(client, taskId) {
        const result = await client.query(`SELECT * FROM earned_work_tasks WHERE id = $1 FOR UPDATE`, [
            taskId,
        ]);
        const row = result.rows[0];
        if (!row)
            throw new ApiError(404, "not_found", "task not found");
        return row;
    }
    async loadTerms(client, taskId, version) {
        const result = await client.query(`SELECT * FROM earned_work_terms WHERE task_id = $1 AND version = $2`, [taskId, version]);
        const row = result.rows[0];
        if (!row)
            throw new ApiError(404, "not_found", "terms not found");
        return row;
    }
    async expireStale(client, now, taskId) {
        if (taskId) {
            await client.query(`UPDATE earned_work_reservations
         SET status = 'expired'
         WHERE task_id = $1 AND status = 'active' AND expires_at <= $2`, [taskId, now]);
            await client.query(`UPDATE earned_work_tasks t
         SET lifecycle = 'open', updated_at = $2
         WHERE t.id = $1
           AND t.lifecycle = 'claimed'
           AND NOT EXISTS (
             SELECT 1 FROM earned_work_reservations r
             WHERE r.task_id = t.id AND r.status IN ('active', 'submitted')
           )`, [taskId, now]);
            return;
        }
        await client.query(`UPDATE earned_work_reservations
       SET status = 'expired'
       WHERE status = 'active' AND expires_at <= $1`, [now]);
        await client.query(`UPDATE earned_work_tasks t
       SET lifecycle = 'open', updated_at = $1
       WHERE t.lifecycle = 'claimed'
         AND NOT EXISTS (
           SELECT 1 FROM earned_work_reservations r
           WHERE r.task_id = t.id AND r.status IN ('active', 'submitted')
         )`, [now]);
    }
    async occupyingReservations(client, taskId, termsVersion) {
        const result = termsVersion == null
            ? await client.query(`SELECT * FROM earned_work_reservations
             WHERE task_id = $1 AND status IN ('active', 'submitted')
             ORDER BY created_at ASC`, [taskId])
            : await client.query(`SELECT * FROM earned_work_reservations
             WHERE task_id = $1 AND terms_version = $2 AND status IN ('active', 'submitted')
             ORDER BY created_at ASC`, [taskId, termsVersion]);
        return result.rows;
    }
    async committedRewardTotal(client, taskId) {
        const result = await client.query(`SELECT t.reward_amount
       FROM earned_work_reservations r
       JOIN earned_work_terms t ON t.task_id = r.task_id AND t.version = r.terms_version
       WHERE r.task_id = $1 AND r.status IN ('active', 'submitted', 'completed')`, [taskId]);
        let total = "0";
        for (const row of result.rows) {
            total = addDecimal(total, row.reward_amount);
        }
        return total;
    }
    async loadAggregateWithClient(client, taskId) {
        const taskResult = await client.query(`SELECT * FROM earned_work_tasks WHERE id = $1`, [taskId]);
        const taskRow = taskResult.rows[0];
        if (!taskRow)
            return null;
        const termsRow = await this.loadTerms(client, taskId, taskRow.current_terms_version);
        const reservationResult = await client.query(`SELECT * FROM earned_work_reservations
       WHERE task_id = $1
       ORDER BY
         CASE status
           WHEN 'submitted' THEN 0
           WHEN 'active' THEN 1
           WHEN 'completed' THEN 2
           WHEN 'released' THEN 3
           ELSE 4
         END,
         created_at DESC
       LIMIT 1`, [taskId]);
        const reservationRow = reservationResult.rows[0] ?? null;
        let submission = null;
        let verdict = null;
        let submissionEvidenceBytes = null;
        if (reservationRow) {
            const submissionResult = await client.query(`SELECT * FROM earned_work_submissions WHERE reservation_id = $1`, [reservationRow.id]);
            const submissionRow = submissionResult.rows[0];
            if (submissionRow) {
                submission = submissionFromRow(submissionRow);
                submissionEvidenceBytes = asEvidenceBuffer(submissionRow.evidence_bytes);
                const verdictResult = await client.query(`SELECT * FROM earned_work_verdicts
           WHERE reservation_id = $1
           ORDER BY ordinal DESC, created_at DESC, id DESC
           LIMIT 1`, [reservationRow.id]);
                if (verdictResult.rows[0])
                    verdict = verdictFromRow(verdictResult.rows[0]);
            }
        }
        const obligationResult = await client.query(`SELECT o.*, COALESCE(o.terms_version, r.terms_version) AS terms_version
       FROM earned_work_obligations o
       JOIN earned_work_reservations r ON r.id = o.reservation_id
       WHERE o.task_id = $1`, [taskId]);
        return {
            task: taskFromRow(taskRow),
            terms: termsFromRow(termsRow),
            reservation: reservationRow ? reservationFromRow(reservationRow) : null,
            submission,
            submissionEvidenceBytes,
            verdict,
            obligation: obligationResult.rows[0] ? obligationFromRow(obligationResult.rows[0]) : null,
        };
    }
    async ownerView(client, taskId) {
        const agg = await this.loadAggregateWithClient(client, taskId);
        if (!agg)
            throw new ApiError(404, "not_found", "task not found");
        return ownerTask(agg);
    }
    async findContributorByTokenHash(tokenHash) {
        const result = await this.query(`SELECT * FROM earned_work_contributor_tokens WHERE token_hash = $1 LIMIT 1`, [tokenHash]);
        const row = result.rows[0];
        if (!row)
            return null;
        if (row.revoked_at)
            return null;
        const now = this.now();
        if (row.expires_at && row.expires_at.getTime() <= now.getTime())
            return null;
        return {
            id: row.id,
            publicId: row.public_id,
            payoutDestination: row.payout_destination,
            taskScope: row.task_scope,
            provenance: row.provenance,
            expiresAt: row.expires_at ? toIso(row.expires_at) : null,
        };
    }
    async createContributorToken(input) {
        const now = this.now();
        const id = newId("tok");
        try {
            await this.executeUnfenced(async (client) => {
                await client.query(`INSERT INTO earned_work_contributor_tokens (
             id, public_id, token_hash, payout_destination, task_scope, provenance, expires_at, revoked_at, created_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,$8)`, [
                    id,
                    input.publicId,
                    input.tokenHash,
                    input.payoutDestination,
                    input.taskScope,
                    input.provenance,
                    input.expiresAt,
                    now,
                ]);
            });
        }
        catch (error) {
            if (isUniqueViolation(error)) {
                throw new ApiError(503, "unavailable", "grant outcome unknown");
            }
            throw error;
        }
        return {
            id,
            publicId: input.publicId,
            expiresAt: input.expiresAt,
            provenance: input.provenance,
        };
    }
    async createTask(input) {
        if (input.budget.asset !== input.terms.reward.asset || input.budget.network !== input.terms.reward.network) {
            throw new ApiError(400, "invalid_input", "budget asset/network must match reward");
        }
        assertExclusiveSlotLimit(input.terms.slotLimit);
        return this.withTx(async (client) => {
            await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
                `earned_work_task_create:${input.idempotencyKey}`,
            ]);
            const replay = await this.loadIdempotency(client, "task_create", "", input.idempotencyKey, input.requestHash);
            if (replay.hit) {
                return { replayed: true, statusCode: replay.statusCode, body: replay.body };
            }
            const now = this.now();
            const taskId = newId("tsk");
            const termsRevision = 1;
            const termsVersion = hashEarnedWorkTerms(taskId, termsRevision, input.terms);
            await client.query(`INSERT INTO earned_work_tasks (
           id, title, summary, provenance, lifecycle, funding_state, payout_state,
           current_terms_version, terms_revision, schema_version, correction_max_revisions,
           budget_amount, budget_asset, budget_network, created_at, updated_at
         ) VALUES ($1,$2,$3,$4,'open','unfunded','none',$5,$6,$7,$8,$9,$10,$11,$12,$12)`, [
                taskId,
                input.title,
                input.summary,
                input.provenance,
                termsVersion,
                termsRevision,
                SCHEMA_VERSION,
                input.correctionMaxRevisions,
                input.budget.amount,
                input.budget.asset,
                input.budget.network,
                now,
            ]);
            await client.query(`INSERT INTO earned_work_terms (
           task_id, version, terms_revision, schema_version, summary, reward_amount, reward_asset, reward_network,
           claim_ttl_seconds, max_artifact_bytes, allowed_media_types, slot_limit, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::text[],$12,$13)`, [
                taskId,
                termsVersion,
                termsRevision,
                SCHEMA_VERSION,
                input.terms.summary,
                input.terms.reward.amount,
                input.terms.reward.asset,
                input.terms.reward.network,
                input.terms.claimTtlSeconds,
                input.terms.maxArtifactBytes,
                input.terms.allowedMediaTypes,
                input.terms.slotLimit,
                now,
            ]);
            await this.appendEvent(client, taskId, "discovery", {
                provenance: input.provenance,
                termsVersion,
                termsRevision,
                schemaVersion: SCHEMA_VERSION,
                reward: input.terms.reward,
            }, now);
            const task = await this.ownerView(client, taskId);
            const body = { task };
            await this.saveIdempotency(client, "task_create", "", input.idempotencyKey, input.requestHash, 201, body, now);
            return { replayed: false, statusCode: 201, body };
        }, "idempotent");
    }
    async addTerms(input) {
        assertExclusiveSlotLimit(input.slotLimit);
        return this.withTx(async (client) => {
            const taskRow = await this.lockTask(client, input.taskId);
            const replay = await this.loadIdempotency(client, "terms_create", input.taskId, input.idempotencyKey, input.requestHash);
            if (replay.hit) {
                return { replayed: true, statusCode: replay.statusCode, body: replay.body };
            }
            const now = this.now();
            await this.expireStale(client, now, input.taskId);
            const occupying = await this.occupyingReservations(client, input.taskId);
            if (occupying.length > 0) {
                throw new ApiError(409, "conflict", "cannot revise terms while a reservation occupies this task");
            }
            if (taskRow.lifecycle === "accepted" || taskRow.payout_state === "owed") {
                throw new ApiError(409, "already_accepted", "accepted tasks cannot grow a new termsVersion");
            }
            if (taskRow.terms_revision >= 1 + taskRow.correction_max_revisions) {
                throw new ApiError(409, "correction_limit", `bounded correction policy allows ${taskRow.correction_max_revisions} further terms revision(s)`);
            }
            if (taskRow.budget_asset !== input.reward.asset || taskRow.budget_network !== input.reward.network) {
                throw new ApiError(400, "invalid_input", "reward asset/network must match the declared budget");
            }
            const termsRevision = taskRow.terms_revision + 1;
            const version = hashEarnedWorkTerms(input.taskId, termsRevision, {
                summary: input.summary,
                reward: input.reward,
                claimTtlSeconds: input.claimTtlSeconds,
                maxArtifactBytes: input.maxArtifactBytes,
                allowedMediaTypes: input.allowedMediaTypes,
                slotLimit: input.slotLimit,
            });
            await client.query(`INSERT INTO earned_work_terms (
           task_id, version, terms_revision, schema_version, summary, reward_amount, reward_asset, reward_network,
           claim_ttl_seconds, max_artifact_bytes, allowed_media_types, slot_limit, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::text[],$12,$13)`, [
                input.taskId,
                version,
                termsRevision,
                SCHEMA_VERSION,
                input.summary,
                input.reward.amount,
                input.reward.asset,
                input.reward.network,
                input.claimTtlSeconds,
                input.maxArtifactBytes,
                input.allowedMediaTypes,
                input.slotLimit,
                now,
            ]);
            let fundingState = taskRow.funding_state;
            if (fundingState === "reserved" && !decimalGte(taskRow.budget_amount, input.reward.amount)) {
                fundingState = "unfunded";
            }
            const lifecycle = taskRow.lifecycle === "rejected" ? "open" : "open";
            await client.query(`UPDATE earned_work_tasks
         SET current_terms_version = $1, terms_revision = $2, schema_version = $3,
             funding_state = $4, lifecycle = $5, payout_state = 'none', updated_at = $6
         WHERE id = $7`, [version, termsRevision, SCHEMA_VERSION, fundingState, lifecycle, now, input.taskId]);
            await this.appendEvent(client, input.taskId, "terms", { termsVersion: version, termsRevision, schemaVersion: SCHEMA_VERSION, reward: input.reward }, now);
            await this.appendEvent(client, input.taskId, "repeat", {
                termsVersion: version,
                termsRevision,
                previousTermsVersion: taskRow.current_terms_version,
                previousTermsRevision: taskRow.terms_revision,
            }, now);
            const task = await this.ownerView(client, input.taskId);
            const body = { task };
            await this.saveIdempotency(client, "terms_create", input.taskId, input.idempotencyKey, input.requestHash, 201, body, now);
            return { replayed: false, statusCode: 201, body };
        }, "idempotent");
    }
    async reserveFunding(taskId, idempotencyKey, requestHash) {
        return this.withTx(async (client) => {
            const taskRow = await this.lockTask(client, taskId);
            const replay = await this.loadIdempotency(client, "funding_reserve", taskId, idempotencyKey, requestHash);
            if (replay.hit) {
                return { replayed: true, statusCode: replay.statusCode, body: replay.body };
            }
            const now = this.now();
            if (taskRow.funding_state === "released") {
                throw new ApiError(409, "conflict", "funding already released to an obligation");
            }
            const terms = await this.loadTerms(client, taskId, taskRow.current_terms_version);
            if (taskRow.funding_state === "reserved") {
                const task = await this.ownerView(client, taskId);
                const body = { task };
                await this.saveIdempotency(client, "funding_reserve", taskId, idempotencyKey, requestHash, 200, body, now);
                return { replayed: false, statusCode: 200, body };
            }
            if (!decimalGte(taskRow.budget_amount, terms.reward_amount)) {
                throw new ApiError(409, "oversubscribed", "budget does not cover the current reward");
            }
            await client.query(`UPDATE earned_work_tasks SET funding_state = 'reserved', updated_at = $1 WHERE id = $2`, [now, taskId]);
            await this.appendEvent(client, taskId, "funding_reserve", {
                budget: {
                    amount: taskRow.budget_amount,
                    asset: taskRow.budget_asset,
                    network: taskRow.budget_network,
                },
                reward: {
                    amount: terms.reward_amount,
                    asset: terms.reward_asset,
                    network: terms.reward_network,
                },
            }, now);
            const task = await this.ownerView(client, taskId);
            const body = { task };
            await this.saveIdempotency(client, "funding_reserve", taskId, idempotencyKey, requestHash, 200, body, now);
            return { replayed: false, statusCode: 200, body };
        }, "idempotent");
    }
    async claim(input) {
        try {
            return await this.withTx(async (client) => {
                await this.lockTask(client, input.taskId);
                assertContributorTaskScope(input.contributor, input.taskId);
                const replay = await this.loadIdempotency(client, "claim", input.taskId, input.idempotencyKey, input.requestHash, input.contributor.id);
                if (replay.hit) {
                    return {
                        replayed: true,
                        statusCode: replay.statusCode,
                        body: replay.body,
                    };
                }
                const now = this.now();
                await this.expireStale(client, now, input.taskId);
                const fresh = await this.lockTask(client, input.taskId);
                if (fresh.funding_state !== "reserved") {
                    throw new ApiError(409, "unfunded", "funding is not reserved");
                }
                if (fresh.lifecycle === "accepted") {
                    throw new ApiError(409, "already_accepted", "task already accepted");
                }
                if (input.termsVersion !== fresh.current_terms_version) {
                    throw new ApiError(409, "terms_changed", "termsVersion does not match current terms");
                }
                const terms = await this.loadTerms(client, input.taskId, fresh.current_terms_version);
                const occupying = await this.occupyingReservations(client, input.taskId, fresh.current_terms_version);
                if (occupying.some((row) => row.contributor_token_id === input.contributor.id)) {
                    throw new ApiError(409, "already_claimed", "contributor already holds an active reservation");
                }
                if (occupying.length >= terms.slot_limit) {
                    throw new ApiError(409, "reserved_elsewhere", "task version already has an active reservation");
                }
                const committed = await this.committedRewardTotal(client, input.taskId);
                const nextCommitted = addDecimal(committed, terms.reward_amount);
                if (!decimalGte(fresh.budget_amount, nextCommitted)) {
                    throw new ApiError(409, "oversubscribed", "remaining reserved budget does not cover reward");
                }
                const reservationId = newId("rsv");
                const expiresAt = new Date(now.getTime() + terms.claim_ttl_seconds * 1000);
                await client.query(`INSERT INTO earned_work_reservations (
             id, task_id, terms_version, contributor_public_id, contributor_token_id,
             status, expires_at, created_at
           ) VALUES ($1,$2,$3,$4,$5,'active',$6,$7)`, [
                    reservationId,
                    input.taskId,
                    terms.version,
                    input.contributor.publicId,
                    input.contributor.id,
                    expiresAt,
                    now,
                ]);
                await client.query(`UPDATE earned_work_tasks SET lifecycle = 'claimed', updated_at = $1 WHERE id = $2`, [now, input.taskId]);
                await this.appendEvent(client, input.taskId, "claim", {
                    reservationId,
                    termsVersion: terms.version,
                    contributorPublicId: input.contributor.publicId,
                    expiresAt: toIso(expiresAt),
                }, now);
                const reservation = reservationFromRow({
                    id: reservationId,
                    task_id: input.taskId,
                    terms_version: terms.version,
                    contributor_public_id: input.contributor.publicId,
                    contributor_token_id: input.contributor.id,
                    status: "active",
                    expires_at: expiresAt,
                    created_at: now,
                });
                const task = await this.ownerView(client, input.taskId);
                const body = { reservation, task };
                await this.saveIdempotency(client, "claim", input.taskId, input.idempotencyKey, input.requestHash, 201, body, now, input.contributor.id);
                return { replayed: false, statusCode: 201, body };
            }, "idempotent");
        }
        catch (error) {
            if (isUniqueViolation(error)) {
                throw new ApiError(409, "reserved_elsewhere", "task version already has an active reservation");
            }
            throw error;
        }
    }
    async submit(input) {
        try {
            return await this.withTx(async (client) => {
                await this.lockTask(client, input.taskId);
                assertContributorTaskScope(input.contributor, input.taskId);
                const replay = await this.loadIdempotency(client, "submit", input.taskId, input.idempotencyKey, input.requestHash, input.contributor.id);
                if (replay.hit) {
                    return {
                        replayed: true,
                        statusCode: replay.statusCode,
                        body: replay.body,
                    };
                }
                const now = this.now();
                await this.expireStale(client, now, input.taskId);
                const reservationResult = await client.query(`SELECT * FROM earned_work_reservations WHERE id = $1 FOR UPDATE`, [input.reservationId]);
                const reservation = reservationResult.rows[0];
                if (!reservation || reservation.task_id !== input.taskId) {
                    throw new ApiError(404, "not_found", "reservation not found");
                }
                if (reservation.contributor_token_id !== input.contributor.id) {
                    throw new ApiError(403, "forbidden", "reservation belongs to a different contributor credential");
                }
                const taskRow = await this.lockTask(client, input.taskId);
                if (reservation.terms_version !== taskRow.current_terms_version) {
                    throw new ApiError(409, "terms_changed", "reservation is bound to a superseded termsVersion");
                }
                if (reservation.status === "expired" || (reservation.status === "active" && reservation.expires_at.getTime() <= now.getTime())) {
                    throw new ApiError(409, "late_submission", "reservation has expired");
                }
                if (reservation.status === "released" || reservation.status === "completed") {
                    throw new ApiError(409, "late_submission", "reservation is no longer open for submission");
                }
                if (reservation.status === "submitted") {
                    throw new ApiError(409, "duplicate_submission", "reservation already has a submission");
                }
                const terms = await this.loadTerms(client, input.taskId, reservation.terms_version);
                if (input.artifact.bytes > terms.max_artifact_bytes) {
                    throw new ApiError(400, "oversize", "artifact.bytes exceeds terms.maxArtifactBytes");
                }
                if (!terms.allowed_media_types.includes(input.artifact.mediaType)) {
                    throw new ApiError(400, "invalid_input", "artifact.mediaType is not allowed by current terms");
                }
                const evidenceBytes = asEvidenceBuffer(input.evidenceBytes);
                if (readBoundSpecDigest(terms.summary) && !evidenceBytes) {
                    throw new ApiError(400, "missing_evidence", "reproduction-bound terms require evidenceBase64; a known digest is not a submission");
                }
                const submissionId = newId("sub");
                await client.query(`INSERT INTO earned_work_submissions (
             id, task_id, reservation_id, terms_version,
             artifact_ref, artifact_digest_sha256, artifact_media_type, artifact_bytes,
             evidence_bytes, created_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [
                    submissionId,
                    input.taskId,
                    reservation.id,
                    reservation.terms_version,
                    input.artifact.ref,
                    input.artifact.digestSha256,
                    input.artifact.mediaType,
                    input.artifact.bytes,
                    evidenceBytes,
                    now,
                ]);
                await client.query(`UPDATE earned_work_reservations SET status = 'submitted' WHERE id = $1`, [
                    reservation.id,
                ]);
                await client.query(`UPDATE earned_work_tasks SET lifecycle = 'submitted', updated_at = $1 WHERE id = $2`, [now, input.taskId]);
                await this.appendEvent(client, input.taskId, "submit", {
                    reservationId: reservation.id,
                    submissionId,
                    termsVersion: reservation.terms_version,
                    artifact: input.artifact,
                    evidenceReceived: evidenceBytes != null,
                    evidenceLength: evidenceBytes?.byteLength ?? 0,
                }, now);
                const submission = submissionFromRow({
                    id: submissionId,
                    task_id: input.taskId,
                    reservation_id: reservation.id,
                    terms_version: reservation.terms_version,
                    artifact_ref: input.artifact.ref,
                    artifact_digest_sha256: input.artifact.digestSha256,
                    artifact_media_type: input.artifact.mediaType,
                    artifact_bytes: input.artifact.bytes,
                    created_at: now,
                });
                const task = await this.ownerView(client, input.taskId);
                const body = { submission, task };
                await this.saveIdempotency(client, "submit", input.taskId, input.idempotencyKey, input.requestHash, 201, body, now, input.contributor.id);
                return { replayed: false, statusCode: 201, body };
            }, "idempotent");
        }
        catch (error) {
            if (isUniqueViolation(error)) {
                throw new ApiError(409, "duplicate_submission", "reservation already has a submission");
            }
            throw error;
        }
    }
    async createVerdict(input) {
        try {
            return await this.withTx(async (client) => {
                await this.lockTask(client, input.taskId);
                const replay = await this.loadIdempotency(client, "verdict", input.taskId, input.idempotencyKey, input.requestHash);
                if (replay.hit) {
                    return {
                        replayed: true,
                        statusCode: replay.statusCode,
                        body: replay.body,
                    };
                }
                const now = this.now();
                const reservationResult = await client.query(`SELECT * FROM earned_work_reservations WHERE id = $1 FOR UPDATE`, [input.reservationId]);
                const reservation = reservationResult.rows[0];
                if (!reservation || reservation.task_id !== input.taskId) {
                    throw new ApiError(404, "not_found", "reservation not found");
                }
                const taskRow = await this.lockTask(client, input.taskId);
                if (taskRow.lifecycle === "accepted" || taskRow.payout_state === "owed") {
                    throw new ApiError(409, "already_accepted", "task already accepted");
                }
                if (reservation.status !== "submitted") {
                    throw new ApiError(409, "conflict", "verdict requires the current submitted reservation");
                }
                if (reservation.terms_version !== taskRow.current_terms_version) {
                    throw new ApiError(409, "terms_changed", "reservation is bound to a superseded termsVersion");
                }
                const submissionResult = await client.query(`SELECT * FROM earned_work_submissions WHERE reservation_id = $1`, [reservation.id]);
                const submission = submissionResult.rows[0];
                if (!submission)
                    throw new ApiError(409, "conflict", "reservation has no submission to verify");
                if (input.artifactDigestSha256 &&
                    input.artifactDigestSha256 !== submission.artifact_digest_sha256) {
                    throw new ApiError(409, "artifact_changed", "artifact digest does not match the bound submission");
                }
                const ordinalResult = await client.query(`SELECT COALESCE(MAX(ordinal), 0) + 1 AS n
           FROM earned_work_verdicts
           WHERE reservation_id = $1`, [reservation.id]);
                const ordinal = Number(ordinalResult.rows[0]?.n ?? 1);
                const verdictId = newId("vrd");
                await client.query(`INSERT INTO earned_work_verdicts (
             id, task_id, reservation_id, submission_id, terms_version,
             artifact_digest_sha256, verifier_version, outcome, reasons, ordinal, created_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)`, [
                    verdictId,
                    input.taskId,
                    reservation.id,
                    submission.id,
                    submission.terms_version,
                    submission.artifact_digest_sha256,
                    input.verifierVersion,
                    input.outcome,
                    JSON.stringify(input.reasons),
                    ordinal,
                    now,
                ]);
                if (input.outcome === "pass") {
                    await client.query(`UPDATE earned_work_tasks SET lifecycle = 'verified', updated_at = $1 WHERE id = $2`, [now, input.taskId]);
                }
                else {
                    await client.query(`UPDATE earned_work_tasks
             SET lifecycle = CASE WHEN lifecycle = 'verified' THEN 'submitted' ELSE lifecycle END,
                 updated_at = $1
             WHERE id = $2`, [now, input.taskId]);
                }
                await this.appendEvent(client, input.taskId, "verdict", {
                    reservationId: reservation.id,
                    submissionId: submission.id,
                    verdictId,
                    ordinal,
                    outcome: input.outcome,
                    verifierVersion: input.verifierVersion,
                    termsVersion: submission.terms_version,
                    artifactDigestSha256: submission.artifact_digest_sha256,
                }, now);
                const verdict = verdictFromRow({
                    id: verdictId,
                    task_id: input.taskId,
                    reservation_id: reservation.id,
                    submission_id: submission.id,
                    terms_version: submission.terms_version,
                    artifact_digest_sha256: submission.artifact_digest_sha256,
                    verifier_version: input.verifierVersion,
                    outcome: input.outcome,
                    reasons: input.reasons,
                    ordinal,
                    created_at: now,
                });
                const task = await this.ownerView(client, input.taskId);
                const body = { verdict, task };
                await this.saveIdempotency(client, "verdict", input.taskId, input.idempotencyKey, input.requestHash, 201, body, now);
                return { replayed: false, statusCode: 201, body };
            }, "idempotent");
        }
        catch (error) {
            if (isUniqueViolation(error)) {
                throw new ApiError(409, "conflict", "a verdict ordinal already exists for this reservation");
            }
            throw error;
        }
    }
    async accept(input) {
        return this.withTx(async (client) => {
            const taskRow = await this.lockTask(client, input.taskId);
            const replay = await this.loadIdempotency(client, "accept", input.taskId, input.idempotencyKey, input.requestHash);
            if (replay.hit) {
                return {
                    replayed: true,
                    statusCode: replay.statusCode,
                    body: replay.body,
                };
            }
            const now = this.now();
            if (taskRow.lifecycle === "accepted" || taskRow.payout_state === "owed") {
                throw new ApiError(409, "already_accepted", "task already accepted");
            }
            const reservationResult = await client.query(`SELECT * FROM earned_work_reservations WHERE id = $1 FOR UPDATE`, [input.reservationId]);
            const reservation = reservationResult.rows[0];
            if (!reservation || reservation.task_id !== input.taskId) {
                throw new ApiError(404, "not_found", "reservation not found");
            }
            if (reservation.status !== "submitted") {
                throw new ApiError(409, "conflict", "accept requires the current submitted reservation");
            }
            if (reservation.terms_version !== taskRow.current_terms_version) {
                throw new ApiError(409, "terms_changed", "reservation is bound to a superseded termsVersion");
            }
            const occupying = await this.occupyingReservations(client, input.taskId);
            if (occupying.length !== 1 || occupying[0]?.id !== reservation.id) {
                throw new ApiError(409, "conflict", "accept requires the current occupying reservation");
            }
            const submissionResult = await client.query(`SELECT * FROM earned_work_submissions WHERE reservation_id = $1`, [reservation.id]);
            const submission = submissionResult.rows[0];
            if (!submission)
                throw new ApiError(409, "conflict", "cannot accept without a submission");
            if (submission.task_id !== input.taskId || submission.terms_version !== reservation.terms_version) {
                throw new ApiError(409, "conflict", "submission is not bound to this reservation and current terms");
            }
            if (input.artifactDigestSha256 &&
                input.artifactDigestSha256 !== submission.artifact_digest_sha256) {
                throw new ApiError(409, "artifact_changed", "artifact digest does not match the bound submission");
            }
            const verdicts = await client.query(`SELECT * FROM earned_work_verdicts
         WHERE reservation_id = $1
         ORDER BY ordinal ASC, created_at ASC, id ASC`, [reservation.id]);
            const rows = verdicts.rows;
            let verdict;
            if (input.verdictId) {
                verdict = rows.find((row) => row.id === input.verdictId);
                if (!verdict) {
                    throw new ApiError(409, "verdict_required", "accept requires a pass verdict bound to this submission");
                }
                const later = rows.some((row) => Number(row.ordinal) > Number(verdict.ordinal));
                if (later) {
                    throw new ApiError(409, "superseded_verdict", "accept cannot bind a previous pass after a later verdict");
                }
            }
            else if (rows.length === 1) {
                verdict = rows[0];
            }
            else if (rows.length > 1) {
                throw new ApiError(409, "missing_verdict_id", "multiple verdicts exist; accept must name the immutable verdict id");
            }
            if (!verdict ||
                verdict.outcome !== "pass" ||
                verdict.submission_id !== submission.id ||
                verdict.task_id !== input.taskId ||
                verdict.terms_version !== reservation.terms_version ||
                verdict.artifact_digest_sha256 !== submission.artifact_digest_sha256) {
                throw new ApiError(409, "verdict_required", "accept requires a pass verdict bound to this submission");
            }
            const terms = await this.loadTerms(client, input.taskId, reservation.terms_version);
            const tokenResult = await client.query(`SELECT * FROM earned_work_contributor_tokens WHERE id = $1`, [reservation.contributor_token_id]);
            const payoutDestination = tokenResult.rows[0]?.payout_destination ?? null;
            const obligationId = newId("obl");
            const obligation = toOwedObligation({
                id: obligationId,
                taskId: input.taskId,
                reservationId: reservation.id,
                submissionId: submission.id,
                contributorPublicId: reservation.contributor_public_id,
                payoutDestination,
                reward: {
                    amount: terms.reward_amount,
                    asset: terms.reward_asset,
                    network: terms.reward_network,
                },
                termsVersion: reservation.terms_version,
                idempotencyKey: input.idempotencyKey,
                createdAt: toIso(now),
                verdictId: verdict.id,
            });
            await client.query(`INSERT INTO earned_work_obligations (
           id, task_id, reservation_id, submission_id, contributor_public_id, payout_destination,
           reward_amount, reward_asset, reward_network, payout_state, idempotency_key, adapter, created_at,
           terms_version, verdict_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'owed',$10,$11,$12,$13,$14)`, [
                obligation.id,
                obligation.taskId,
                obligation.reservationId,
                obligation.submissionId,
                obligation.contributorPublicId,
                obligation.payoutDestination,
                obligation.reward.amount,
                obligation.reward.asset,
                obligation.reward.network,
                obligation.idempotencyKey,
                obligation.adapter,
                now,
                obligation.termsVersion,
                obligation.verdictId,
            ]);
            await client.query(`UPDATE earned_work_reservations SET status = 'completed' WHERE id = $1`, [
                reservation.id,
            ]);
            await client.query(`UPDATE earned_work_tasks
         SET lifecycle = 'accepted', funding_state = 'released', payout_state = 'owed', updated_at = $1
         WHERE id = $2`, [now, input.taskId]);
            await this.appendEvent(client, input.taskId, "accept", {
                reservationId: reservation.id,
                submissionId: submission.id,
                verdictId: verdict.id,
            }, now);
            await this.appendEvent(client, input.taskId, "pay", {
                obligationId: obligation.id,
                payoutState: "owed",
                transfer: null,
                note: obligation.note,
            }, now);
            const task = await this.ownerView(client, input.taskId);
            const body = { obligation, task };
            await this.saveIdempotency(client, "accept", input.taskId, input.idempotencyKey, input.requestHash, 201, body, now);
            return { replayed: false, statusCode: 201, body };
        }, "idempotent");
    }
    async reject(input) {
        return this.withTx(async (client) => {
            const taskRow = await this.lockTask(client, input.taskId);
            const replay = await this.loadIdempotency(client, "reject", input.taskId, input.idempotencyKey, input.requestHash);
            if (replay.hit) {
                return { replayed: true, statusCode: replay.statusCode, body: replay.body };
            }
            const now = this.now();
            if (taskRow.lifecycle === "accepted" || taskRow.payout_state === "owed") {
                throw new ApiError(409, "already_accepted", "accepted tasks cannot be rejected");
            }
            const reservationResult = await client.query(`SELECT * FROM earned_work_reservations WHERE id = $1 FOR UPDATE`, [input.reservationId]);
            const reservation = reservationResult.rows[0];
            if (!reservation || reservation.task_id !== input.taskId) {
                throw new ApiError(404, "not_found", "reservation not found");
            }
            if (reservation.status === "completed") {
                throw new ApiError(409, "already_accepted", "completed reservation cannot be rejected");
            }
            if (reservation.status === "released") {
                throw new ApiError(409, "conflict", "reservation is already released");
            }
            await client.query(`UPDATE earned_work_reservations SET status = 'released' WHERE id = $1`, [
                reservation.id,
            ]);
            await client.query(`UPDATE earned_work_tasks SET lifecycle = 'rejected', updated_at = $1 WHERE id = $2`, [now, input.taskId]);
            await this.appendEvent(client, input.taskId, "reject", { reservationId: reservation.id, reason: input.reason }, now);
            const task = await this.ownerView(client, input.taskId);
            const body = { task };
            await this.saveIdempotency(client, "reject", input.taskId, input.idempotencyKey, input.requestHash, 200, body, now);
            return { replayed: false, statusCode: 200, body };
        }, "idempotent");
    }
    async getTermsDocument(taskId, termsVersion) {
        const task = await this.query(`SELECT id FROM earned_work_tasks WHERE id = $1`, [taskId]);
        if (!task.rows[0])
            return null;
        const termsResult = await this.query(`SELECT * FROM earned_work_terms WHERE task_id = $1 AND version = $2`, [taskId, termsVersion]);
        const row = termsResult.rows[0];
        if (!row)
            return null;
        const terms = termsFromRow(row);
        return {
            termsVersion: terms.version,
            termsDocument: publicTermsDocument(taskId, terms),
        };
    }
    async getTask(taskId) {
        return this.withTx(async (client) => {
            await this.expireStale(client, this.now(), taskId);
            return this.loadAggregateWithClient(client, taskId);
        }, "read");
    }
    async listOpenTasks() {
        return this.withTx(async (client) => {
            const now = this.now();
            await this.expireStale(client, now);
            const result = await client.query(`SELECT id FROM earned_work_tasks
         WHERE lifecycle = 'open' AND funding_state = 'reserved'
         ORDER BY created_at DESC
         LIMIT 100`);
            const views = [];
            for (const row of result.rows) {
                const agg = await this.loadAggregateWithClient(client, row.id);
                if (agg)
                    views.push(publicTask(agg, now));
            }
            return views;
        }, "read");
    }
    async getObligation(taskId) {
        const task = await this.query(`SELECT id FROM earned_work_tasks WHERE id = $1`, [taskId]);
        if (!task.rows[0])
            throw new ApiError(404, "not_found", "task not found");
        const result = await this.query(`SELECT o.*, COALESCE(o.terms_version, r.terms_version) AS terms_version
       FROM earned_work_obligations o
       JOIN earned_work_reservations r ON r.id = o.reservation_id
       WHERE o.task_id = $1`, [taskId]);
        return result.rows[0] ? obligationFromRow(result.rows[0]) : null;
    }
    async getContributorObligationReadback(taskId, contributor) {
        const task = await this.query(`SELECT id FROM earned_work_tasks WHERE id = $1`, [taskId]);
        if (!task.rows[0])
            throw new ApiError(404, "not_found", "task not found");
        const held = await this.query(`SELECT * FROM earned_work_reservations
       WHERE task_id = $1 AND contributor_token_id = $2
       ORDER BY created_at DESC
       LIMIT 1`, [taskId, contributor.id]);
        if (!held.rows[0]) {
            throw new ApiError(403, "forbidden", "contributor credential does not hold a reservation on this task");
        }
        const result = await this.query(`SELECT o.*, COALESCE(o.terms_version, r.terms_version) AS terms_version
       FROM earned_work_obligations o
       JOIN earned_work_reservations r ON r.id = o.reservation_id
       WHERE o.task_id = $1 AND r.contributor_token_id = $2`, [taskId, contributor.id]);
        if (!result.rows[0]) {
            return { readback: "none", obligation: null };
        }
        const obligation = obligationFromRow(result.rows[0]);
        return {
            readback: "owed",
            obligation: { ...obligation, payoutDestination: null },
        };
    }
    async getPayout(taskId) {
        const agg = await this.getTask(taskId);
        if (!agg)
            throw new ApiError(404, "not_found", "task not found");
        const reconciliation = reconcilePayout({
            payoutState: agg.task.payoutState,
            obligation: agg.obligation,
        });
        return {
            taskId,
            payoutState: reconciliation.payoutState,
            obligationId: reconciliation.obligationId,
            reservationId: reconciliation.reservationId,
            contributorPublicId: reconciliation.contributorPublicId,
            payoutDestination: reconciliation.payoutDestination,
            termsVersion: reconciliation.termsVersion,
            reconciliation,
        };
    }
}
/**
 * Boot always migrate()s: CREATE SCHEMA + DDL. The DATABASE_URL login must be
 * the dedicated app/schema owner used on every start and restart. A DML-only
 * runtime role is not a working kernel path.
 */
export async function createPostgresStore(databaseUrl, options = {}) {
    const store = new PostgresStore(databaseUrl, options);
    try {
        await store.migrate();
        return store;
    }
    catch (error) {
        await store.close().catch(() => { });
        throw error;
    }
}
//# sourceMappingURL=postgres.js.map