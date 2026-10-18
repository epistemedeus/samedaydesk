import { checked, requireThat } from './contracts.js';
import { digest, MemoryOperationJournal } from './operations.js';
export class MemoryApprovalJournal {
    rows = new Map();
    locks = new MemoryOperationJournal();
    async exclusive(t, a, fn) {
        return this.locks.exclusive(t, a, () => fn({
            read: async (tenant, allocation) => structuredClone(this.rows.get(JSON.stringify([tenant, allocation])) ?? null),
            write: async (record) => {
                requireThat(record.request.tenantId === t && record.request.allocationId === a, 'approval_scope');
                const key = JSON.stringify([t, a]), prior = this.rows.get(key);
                requireThat(!prior || digest(prior.request) === digest(record.request), 'approval_conflict');
                this.rows.set(key, structuredClone(record));
            },
        }));
    }
}
const receiptKey = (r, c) => JSON.stringify([r.asset.chain, c.txRef]);
function observation(actor, rows) {
    checked('AuthenticatedActor', actor);
    const row = rows.find(r => r.request.tenantId === actor.tenantId);
    requireThat(rows.length === 0 || row && row.request.actorId === actor.actorId, 'forbidden');
    return row?.joined ? { state: 'settled', settlement: structuredClone(row.joined) } : { state: 'unknown', settlement: null };
}
export class MemoryCaptureReceipts {
    rows = new Map();
    allocations = new Map();
    async settlementForAllocation(actor, allocationId) {
        return observation(actor, [...this.rows.values()].filter(r => r.request.allocationId === allocationId));
    }
    async reserve(request, capture) {
        const k = receiptKey(request, capture), a = JSON.stringify([request.tenantId, request.allocationId]);
        const prior = this.rows.get(k), owner = this.allocations.get(a);
        requireThat(!owner || owner === k, 'capture_receipt_conflict');
        requireThat(!prior || digest(prior.request) === digest(request), 'capture_receipt_conflict');
        if (prior)
            return structuredClone(prior);
        const row = { request, capture, joined: null };
        this.rows.set(k, structuredClone(row));
        this.allocations.set(a, k);
        return structuredClone(row);
    }
    async save(row) {
        const k = receiptKey(row.request, row.capture), prior = this.rows.get(k);
        requireThat(prior && digest(prior.request) === digest(row.request), 'capture_receipt_conflict');
        requireThat(!prior.joined || prior.joined.canonicalObligationId === row.joined?.canonicalObligationId, 'capture_join_conflict');
        if (!prior.joined)
            this.rows.set(k, structuredClone(row));
    }
}
function table(schema, name) {
    requireThat(/^[a-z][a-z0-9_]{0,62}$/.test(schema), 'journal_schema');
    return `"${schema}"."${name}"`;
}
/** Durable metadata in the existing owning database; no balances/debts/kernel table changes. */
export class PostgresApprovalJournal {
    pool;
    table;
    constructor(pool, schema) {
        this.pool = pool;
        this.table = table(schema, 'ae14_capture_approvals');
    }
    async prepare() {
        await this.pool.query(`CREATE TABLE IF NOT EXISTS ${this.table} (tenant_id text NOT NULL, allocation_id text NOT NULL, record jsonb NOT NULL, PRIMARY KEY(tenant_id,allocation_id))`);
    }
    async exclusive(t, a, fn) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [JSON.stringify([this.table, t, a])]);
            const read = async (tenant, allocation) => {
                requireThat(tenant === t && allocation === a, 'approval_scope');
                return (await client.query(`SELECT record FROM ${this.table} WHERE tenant_id=$1 AND allocation_id=$2`, [t, a])).rows[0]?.record ?? null;
            };
            const result = await fn({ read, write: async (row) => {
                    requireThat(row.request.tenantId === t && row.request.allocationId === a, 'approval_scope');
                    const prior = await read(t, a);
                    requireThat(!prior || digest(prior.request) === digest(row.request), 'approval_conflict');
                    await client.query(`INSERT INTO ${this.table}(tenant_id,allocation_id,record) VALUES($1,$2,$3) ON CONFLICT(tenant_id,allocation_id) DO UPDATE SET record=EXCLUDED.record`, [t, a, JSON.stringify(row)]);
                } });
            await client.query('COMMIT');
            return result;
        }
        catch (error) {
            await client.query('ROLLBACK').catch(() => { });
            throw error;
        }
        finally {
            client.release();
        }
    }
}
/** Stores one qualified capture reference -> existing canonical obligation, not a second debt ledger. */
export class PostgresCaptureReceipts {
    pool;
    table;
    constructor(pool, schema) {
        this.pool = pool;
        this.table = table(schema, 'ae14_capture_receipt_bindings');
    }
    async prepare() {
        await this.pool.query(`CREATE TABLE IF NOT EXISTS ${this.table} (chain text NOT NULL, tx_ref text NOT NULL, tenant_id text NOT NULL, allocation_id text NOT NULL, record jsonb NOT NULL, PRIMARY KEY(chain,tx_ref), UNIQUE(tenant_id,allocation_id))`);
    }
    async settlementForAllocation(actor, allocationId) {
        checked('AuthenticatedActor', actor);
        // Fetch only binding metadata. Foreign allocation existence cannot become an authorized read.
        const result = await this.pool.query(`SELECT record FROM ${this.table} WHERE allocation_id=$1`, [allocationId]);
        return observation(actor, result.rows.map(r => r.record));
    }
    async reserve(request, capture) {
        try {
            await this.pool.query(`INSERT INTO ${this.table}(chain,tx_ref,tenant_id,allocation_id,record) VALUES($1,$2,$3,$4,$5) ON CONFLICT(chain,tx_ref) DO NOTHING`, [request.asset.chain, capture.txRef, request.tenantId, request.allocationId, JSON.stringify({ request, capture, joined: null })]);
        }
        catch (error) {
            if (error.code === '23505')
                requireThat(false, 'capture_receipt_conflict');
            throw error;
        }
        const row = (await this.pool.query(`SELECT record FROM ${this.table} WHERE chain=$1 AND tx_ref=$2`, [request.asset.chain, capture.txRef])).rows[0].record;
        requireThat(digest(row.request) === digest(request), 'capture_receipt_conflict');
        return row;
    }
    async save(row) {
        const result = await this.pool.query(`UPDATE ${this.table} SET record=$3 WHERE chain=$1 AND tx_ref=$2 AND record->'joined'='null'::jsonb AND record->'request'=$4::jsonb`, [row.request.asset.chain, row.capture.txRef, JSON.stringify(row), JSON.stringify(row.request)]);
        if (!result.rowCount) {
            const prior = await this.reserve(row.request, row.capture);
            requireThat(prior.joined?.canonicalObligationId === row.joined?.canonicalObligationId, 'capture_join_conflict');
        }
    }
}
