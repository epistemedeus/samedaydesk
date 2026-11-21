import { readFile } from "node:fs/promises";
import { consentRecordValid, nonnegative, operationValid, privateId, publicId, sha256 } from "./validation.js";
export async function migrateShowcase(pool) {
    await pool.query(await readFile(new URL("./migrations/001_showcase.sql", import.meta.url), "utf8"));
}
function decodeRecord(row) {
    if (!row)
        return null;
    if (!consentRecordValid(row.record) || row.record.workId !== row.work_id || row.record.accountId !== row.account_id)
        throw new Error("invalid showcase consent storage");
    return row.record;
}
function decodeOperation(row) {
    if (!row)
        return null;
    if (!operationValid(row.operation) || row.operation.accountId !== row.account_id || row.operation.workId !== row.work_id ||
        row.operation.idempotencyKey !== row.idempotency_key)
        throw new Error("invalid showcase operation storage");
    return row.operation;
}
/** A module-specific consent table and operation readback, not a replacement work or payment store. */
export function createPostgresConsentedSummaryStore(pool) {
    return {
        async read(workId) {
            if (!publicId(workId))
                throw new Error("invalid work id");
            const result = await pool.query("SELECT work_id, account_id, record FROM contributor_showcase_consents WHERE work_id = $1", [workId]);
            return decodeRecord(result.rows[0]);
        },
        async readOperation(accountId, workId, idempotencyKey) {
            if (!privateId(accountId) || !publicId(workId) || !privateId(idempotencyKey))
                throw new Error("invalid operation identity");
            const result = await pool.query(`SELECT account_id, work_id, idempotency_key, operation FROM contributor_showcase_operations
        WHERE account_id = $1 AND work_id = $2 AND idempotency_key = $3`, [accountId, workId, idempotencyKey]);
            return decodeOperation(result.rows[0]);
        },
        async readMany(workIds) {
            if (!Array.isArray(workIds) || workIds.length > 50 || workIds.some(id => !publicId(id)) || new Set(workIds).size !== workIds.length)
                throw new Error("invalid work list");
            const result = await pool.query("SELECT work_id, account_id, record FROM contributor_showcase_consents WHERE work_id = ANY($1::text[])", [workIds]);
            return result.rows.map(row => decodeRecord(row));
        },
        async apply(write) {
            if (!consentRecordValid(write.record) || !nonnegative(write.expectedVersion) ||
                write.record.version !== write.expectedVersion + 1 || !privateId(write.idempotencyKey) || !sha256(write.requestHash))
                throw new Error("invalid consent write");
            const client = await pool.connect();
            try {
                await client.query("BEGIN");
                // Also serializes the absent-row case; a simultaneous first consent cannot bypass CAS.
                await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`contributor-showcase:${write.record.workId}`]);
                const prior = await client.query(`SELECT account_id, work_id, idempotency_key, operation FROM contributor_showcase_operations
          WHERE account_id = $1 AND work_id = $2 AND idempotency_key = $3`, [write.record.accountId, write.record.workId, write.idempotencyKey]);
                const operation = decodeOperation(prior.rows[0]);
                if (operation) {
                    await client.query("COMMIT");
                    return operation.requestHash === write.requestHash ? { kind: "replayed", operation } : { kind: "idempotency_conflict" };
                }
                const current = decodeRecord((await client.query(`SELECT work_id, account_id, record FROM contributor_showcase_consents
          WHERE work_id = $1 FOR UPDATE`, [write.record.workId])).rows[0]);
                if (current && (current.accountId !== write.record.accountId || current.profileId !== write.record.profileId)) {
                    await client.query("ROLLBACK");
                    return { kind: "forbidden" };
                }
                if ((current?.version ?? 0) !== write.expectedVersion) {
                    await client.query("ROLLBACK");
                    return { kind: "conflict" };
                }
                const created = {
                    accountId: write.record.accountId, workId: write.record.workId, idempotencyKey: write.idempotencyKey,
                    requestHash: write.requestHash, resultVersion: write.record.version,
                };
                await client.query(`INSERT INTO contributor_showcase_consents (work_id, account_id, record) VALUES ($1, $2, $3::jsonb)
          ON CONFLICT (work_id) DO UPDATE SET record = EXCLUDED.record, updated_at=CURRENT_TIMESTAMP`, [write.record.workId, write.record.accountId, JSON.stringify(write.record)]);
                await client.query(`INSERT INTO contributor_showcase_operations (account_id, work_id, idempotency_key, operation)
          VALUES ($1, $2, $3, $4::jsonb)`, [created.accountId, created.workId, created.idempotencyKey, JSON.stringify(created)]);
                await client.query("COMMIT");
                return { kind: "applied", operation: created };
            }
            catch (error) {
                await client.query("ROLLBACK").catch(() => { });
                throw error;
            }
            finally {
                client.release();
            }
        },
        async listVisibleWorkIds(limit) {
            if (!nonnegative(limit) || limit < 1 || limit > 50)
                throw new Error("invalid list limit");
            const result = await pool.query(`SELECT work_id, account_id, record FROM contributor_showcase_consents
        WHERE record->>'visibility' = 'visible' ORDER BY work_id LIMIT $1`, [limit]);
            return result.rows.map(row => decodeRecord(row).workId);
        },
    };
}
//# sourceMappingURL=postgres.js.map