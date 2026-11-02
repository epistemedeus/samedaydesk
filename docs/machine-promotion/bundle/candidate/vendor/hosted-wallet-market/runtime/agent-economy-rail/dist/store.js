import { AsyncLocalStorage } from 'node:async_hooks';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { requireThat, digest } from '../../agent-economy-foundation/dist/index.js';
/** Single-host authority/operation journal. No balances, debts or acceptance writer. */
export class RailStore {
    file;
    namespace;
    db;
    tail = Promise.resolve();
    txContext = new AsyncLocalStorage();
    constructor(file, namespace = { kind: 'chain' }) {
        this.file = file;
        this.namespace = namespace;
        if (namespace.kind === 'fork')
            requireThat(/^[A-Za-z0-9._-]{1,64}$/.test(namespace.forkId), 'fork_id');
        mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
        this.db = new DatabaseSync(file);
        chmodSync(file, 0o600);
        this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
        this.db.exec('CREATE TABLE IF NOT EXISTS records (space TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(space,key))');
    }
    get(space, key) {
        const row = this.db.prepare('SELECT value FROM records WHERE space=? AND key=?').get(space, key);
        return row ? JSON.parse(row.value) : null;
    }
    all(space) { return this.db.prepare('SELECT value FROM records WHERE space=? ORDER BY key').all(space).map(r => JSON.parse(r.value)); }
    put(space, key, value) {
        this.db.prepare('INSERT INTO records(space,key,value) VALUES(?,?,?) ON CONFLICT(space,key) DO UPDATE SET value=excluded.value').run(space, key, JSON.stringify(value));
    }
    fence(space, key, value, code) {
        const old = this.get(space, key);
        requireThat(!old || digest(old) === digest(value), code);
        this.put(space, key, value);
    }
    inTransaction() { return Boolean(this.txContext.getStore()); }
    async beginImmediate() {
        let locked = false;
        for (let i = 0; i < 300; i++) {
            try {
                this.db.exec('BEGIN IMMEDIATE');
                locked = true;
                break;
            }
            catch (e) {
                if (!(e instanceof Error) || !/locked|busy/.test(e.message))
                    throw e;
                await new Promise(r => setTimeout(r, 10));
            }
        }
        requireThat(locked, 'journal_busy');
    }
    async transaction(fn) {
        // Nested call on this async stack joins the open transaction. A concurrent job queues.
        if (this.txContext.getStore() && !this.directFrames)
            return await fn();
        const next = this.tail.catch(() => { }).then(async () => {
            await this.beginImmediate();
            try {
                const result = await this.txContext.run(true, fn);
                this.db.exec('COMMIT');
                return result;
            }
            catch (e) {
                this.db.exec('ROLLBACK');
                throw e;
            }
        });
        this.tail = next;
        return next;
    }
    /**
     * Commit the caller's open writes, run fn with no write lock held, then
     * reopen a transaction for the caller. fn's own frames stay durable if
     * the caller later rolls back.
     */
    async pause(fn) {
        requireThat(this.txContext.getStore() && !this.directFrames, 'journal_not_open');
        this.db.exec('COMMIT');
        this.directFrames = true;
        try {
            return await fn();
        }
        finally {
            this.directFrames = false;
            await this.beginImmediate();
        }
    }
    /** One committed unit of work. A direct frame does not queue behind itself. */
    async frame(fn) {
        if (this.directFrames) {
            await this.beginImmediate();
            try {
                const result = await fn();
                this.db.exec('COMMIT');
                return result;
            }
            catch (error) {
                this.db.exec('ROLLBACK');
                throw error;
            }
        }
        return this.transaction(fn);
    }
    remove(space, key) {
        this.db.prepare('DELETE FROM records WHERE space=? AND key=?').run(space, key);
    }
    close() { this.db.close(); }
}
