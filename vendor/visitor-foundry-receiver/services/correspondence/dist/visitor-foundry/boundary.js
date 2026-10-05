import pg from "pg";
import { readFile } from "node:fs/promises";
import { parsePgSchema, parsePoolMax, quoteIdent } from "../config.js";
import { hashToken } from "../crypto.js";
export class IntegrationError extends Error {
    status;
    code;
    nextAction;
    constructor(status, code, nextAction = "Reload current state; reconcile an unknown outcome before retrying.") {
        super(code);
        this.status = status;
        this.code = code;
        this.nextAction = nextAction;
    }
}
// A transaction owns its checked-out connection. Abort destroys that lease;
// it never returns a client with uncertain/in-flight SQL to the pool.
export function transactionBudget(signal) {
    let client, destroyed = false;
    const abort = () => { if (client && !destroyed) {
        destroyed = true;
        client.release(true);
    } };
    const check = () => { if (signal?.aborted)
        throw new IntegrationError(503, "transaction_aborted"); };
    signal?.addEventListener("abort", abort, { once: true });
    return {
        check,
        attach(c) { client = c; if (signal?.aborted)
            abort(); check(); },
        get destroyed() { return destroyed; },
        dispose() { signal?.removeEventListener("abort", abort); if (client && !destroyed)
            client.release(); client = undefined; },
    };
}
export class FoundryBoundary {
    pool;
    pending = 0;
    schema;
    constructor(url, options) {
        this.schema = parsePgSchema(options.schema);
        this.pool = new pg.Pool({ connectionString: url, max: parsePoolMax(String(options.poolMax ?? 2)),
            connectionTimeoutMillis: 3000, statement_timeout: 5000, query_timeout: 6000,
            idleTimeoutMillis: 10000, allowExitOnIdle: true, application_name: "neomorphic_vf04" });
        this.pool.on("error", () => { });
    }
    async tx(fn, { signal } = {}) {
        if (this.pending >= 128)
            throw new IntegrationError(503, "ingress_capacity");
        this.pending++;
        const budget = transactionBudget(signal);
        let c;
        try {
            budget.check();
            c = await this.pool.connect();
            budget.attach(c);
            await c.query("BEGIN");
            await c.query(`SET LOCAL search_path TO ${quoteIdent(this.schema)}`);
            await c.query("SET LOCAL lock_timeout='1500ms'");
            await c.query("SET LOCAL idle_in_transaction_session_timeout='10000ms'");
            const result = await fn(c);
            budget.check();
            await c.query("COMMIT");
            budget.check();
            return result;
        }
        catch (e) {
            if (c && !budget.destroyed)
                await c.query("ROLLBACK").catch(() => { });
            budget.check();
            throw e;
        }
        finally {
            budget.dispose();
            this.pending--;
        }
    }
    async authorize(c, ctx, write = false) {
        const row = (await c.query("SELECT * FROM correspondence_grants WHERE token_hash=$1 FOR SHARE", [hashToken(ctx.token)])).rows[0];
        const now = await this.now(c);
        if (!row || row.revoked_at || (row.expires_at && row.expires_at <= new Date(now)))
            throw new IntegrationError(401, "unauthorized");
        if (row.project_id !== ctx.projectId)
            throw new IntegrationError(404, "not_found");
        if (write && row.role === "reader")
            throw new IntegrationError(403, "forbidden");
        const p = (await c.query("SELECT status FROM correspondence_projects WHERE id=$1 FOR SHARE", [ctx.projectId])).rows[0];
        if (!p)
            throw new IntegrationError(404, "not_found");
        if (write && p.status === "resolved")
            throw new IntegrationError(409, "project_resolved");
        return row;
    }
    async now(c) { return (await c.query("SELECT clock_timestamp() AS now")).rows[0].now.toISOString(); }
    async migrate() {
        const sql = await Promise.all(["001_vf04_integration.sql", "002_vf04_wire.sql", "003_vf04_revalidation.sql", "004_vf09_portable.sql"].map(name => readFile(new URL(`../../migrations/visitor-foundry/${name}`, import.meta.url), "utf8")));
        await this.tx(async (c) => {
            await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`vf04:migration:${this.schema}`]);
            for (const statement of sql)
                await c.query(statement);
        });
    }
    async checkReady() {
        await this.tx(async (c) => {
            for (const table of ["pools", "candidates", "attempts", "publications", "graph", "shares", "manifests", "gaps", "experiments", "invocations", "identities", "environment_evidence"])
                await c.query(`SELECT 1 FROM correspondence_vf04_${table} LIMIT 0`);
            await c.query("SELECT verification,participation FROM correspondence_vf04_pools LIMIT 0");
            await c.query("SELECT children,portable_result FROM correspondence_vf04_attempts LIMIT 0");
            await c.query("SELECT execution,state FROM correspondence_vf04_invocations LIMIT 0");
            await c.query("SELECT record FROM correspondence_vf04_packages LIMIT 0");
            for (const table of ["candidates", "attempts", "publications"])
                await c.query(`SELECT generation,verification FROM correspondence_vf04_${table} LIMIT 0`);
        });
    }
    async close() { await this.pool.end(); }
}
//# sourceMappingURL=boundary.js.map