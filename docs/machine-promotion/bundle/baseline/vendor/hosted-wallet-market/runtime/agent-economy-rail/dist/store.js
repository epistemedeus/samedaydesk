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
    async transaction(fn) {
        // Nested call on this async stack joins the open transaction. A concurrent job queues.
        if (this.txContext.getStore())
            return await fn();
        const next = this.tail.catch(() => { }).then(async () => {
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
    close() { this.db.close(); }
}
