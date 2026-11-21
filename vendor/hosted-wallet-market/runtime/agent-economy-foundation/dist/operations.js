import { createHash } from 'node:crypto';
import { BoundaryError, checked, requireThat } from './contracts.js';
export function digest(value) {
    function sort(v) {
        if (Array.isArray(v))
            return v.map(sort);
        if (v && typeof v === 'object')
            return Object.fromEntries(Object.keys(v).sort().map(k => [k, sort(v[k])]));
        return v;
    }
    return createHash('sha256').update(JSON.stringify(sort(value))).digest('hex');
}
/** Process-local laboratory journal. Not a production durable store. */
export class MemoryOperationJournal {
    rows = new Map();
    allocations = new Map();
    locks = new Map();
    key(t, id) { return JSON.stringify([t, id]); }
    async exclusive(t, id, fn) {
        const k = this.key(t, id), prior = this.locks.get(k) ?? Promise.resolve();
        const next = prior.catch(() => { }).then(fn);
        this.locks.set(k, next);
        try {
            return await next;
        }
        finally {
            if (this.locks.get(k) === next)
                this.locks.delete(k);
        }
    }
    async read(t, id) { return structuredClone(this.rows.get(this.key(t, id)) ?? null); }
    async write(row) {
        const k = this.key(row.request.tenantId, row.request.operationId), prior = this.rows.get(k);
        requireThat(!prior || prior.requestDigest === row.requestDigest, 'operation_conflict');
        const allocation = JSON.stringify([row.request.tenantId, row.request.kind, row.request.allocationId]);
        const owner = this.allocations.get(allocation);
        requireThat(!owner || owner === row.request.operationId, 'allocation_operation_conflict');
        this.allocations.set(allocation, row.request.operationId);
        this.rows.set(k, structuredClone(row));
    }
    snapshot() { return structuredClone([...this.rows.values()]); }
    /** Internal laboratory view used by the authenticated wallet recovery port. */
    records(tenantId) { return structuredClone([...this.rows.values()].filter(r => r.request.tenantId === tenantId)); }
    constructor(rows = []) {
        for (const r of rows) {
            const allocation = JSON.stringify([r.request.tenantId, r.request.kind, r.request.allocationId]);
            const owner = this.allocations.get(allocation);
            requireThat(!owner || owner === r.request.operationId, 'allocation_operation_conflict');
            this.allocations.set(allocation, r.request.operationId);
            this.rows.set(this.key(r.request.tenantId, r.request.operationId), structuredClone(r));
        }
    }
}
export class OperationRecovery {
    journal;
    adapter;
    constructor(journal, adapter) {
        this.journal = journal;
        this.adapter = adapter;
    }
    /** Original authenticated actor only. This route cannot authorize, sign or submit. */
    async observe(actorInput, operationId) {
        const actor = checked('AuthenticatedActor', actorInput);
        return this.journal.exclusive(actor.tenantId, operationId, async () => {
            const row = await this.journal.read(actor.tenantId, operationId);
            requireThat(row && row.request.actorId === actor.actorId, 'forbidden');
            if (row.receipt.state === 'confirmed' || row.receipt.state === 'failed')
                return row.receipt;
            let receipt;
            try {
                receipt = await this.adapter.readback(row.request);
            }
            catch (error) {
                if (error instanceof BoundaryError)
                    throw error;
                return row.receipt;
            }
            if (receipt.state === 'absent')
                return { state: 'unknown', requestDigest: row.requestDigest, effectRef: null };
            this.assertReceipt(receipt, row.requestDigest);
            await this.journal.write({ ...row, receipt });
            return structuredClone(receipt);
        });
    }
    assertReceipt(receipt, hash) {
        requireThat(receipt.requestDigest === hash, 'receipt_binding');
        requireThat(['unknown', 'pending', 'confirmed', 'failed'].includes(receipt.state), 'receipt_state');
        requireThat(receipt.state !== 'confirmed' || Boolean(receipt.effectRef), 'missing_effect_ref');
    }
    async recover(actorInput, input) {
        const actor = checked('AuthenticatedActor', actorInput), request = checked('OperationRequest', input);
        requireThat(actor.tenantId === request.tenantId && actor.actorId === request.actorId, 'forbidden');
        return this.journal.exclusive(request.tenantId, request.operationId, async () => {
            const hash = digest(request), prior = await this.journal.read(request.tenantId, request.operationId);
            requireThat(!prior || prior.requestDigest === hash, 'operation_conflict');
            if (prior?.receipt.state === 'confirmed' || prior?.receipt.state === 'failed')
                return prior.receipt;
            // Existing uncertain operations can be observed after revocation. New effects still need authority.
            if (!prior)
                await this.adapter.authorize?.(request);
            const unknown = { state: 'unknown', requestDigest: hash, effectRef: null };
            // Written BEFORE transport. A crashed/lost write acknowledgement is never a safe failure.
            await this.journal.write({ request, requestDigest: hash, receipt: prior?.receipt ?? unknown });
            let receipt;
            try {
                receipt = await this.adapter.readback(request);
            }
            catch (error) {
                if (error instanceof BoundaryError)
                    throw error;
                return unknown;
            }
            if (receipt.state === 'absent') {
                await this.adapter.authorize?.(request);
                try {
                    receipt = await this.adapter.submit(request);
                }
                catch (error) {
                    if (error instanceof BoundaryError)
                        throw error;
                    return unknown;
                }
            }
            this.assertReceipt(receipt, hash);
            await this.journal.write({ request, requestDigest: hash, receipt });
            return structuredClone(receipt);
        });
    }
}
/** Nonpaying fake, including unknown outcomes and a response lost after the single effect. */
export class FakeEffectAdapter {
    effects = new Map();
    submitCalls = 0;
    effectCount = 0;
    loseNextResponse = false;
    unavailable = false;
    nextState = 'confirmed';
    key(r) { return JSON.stringify([r.tenantId, r.operationId]); }
    async readback(r) {
        if (this.unavailable)
            return { state: 'unknown', requestDigest: digest(r), effectRef: null };
        const receipt = this.effects.get(this.key(r));
        return structuredClone(receipt ?? { state: 'absent' });
    }
    async submit(r) {
        this.submitCalls++;
        const k = this.key(r), prior = this.effects.get(k);
        requireThat(!prior || prior.requestDigest === digest(r), 'adapter_operation_conflict');
        if (prior)
            return structuredClone(prior);
        const receipt = { state: this.nextState, requestDigest: digest(r), effectRef: this.nextState === 'confirmed' ? `fake:${this.effectCount + 1}` : null };
        this.effects.set(k, receipt);
        if (receipt.state === 'confirmed')
            this.effectCount++;
        if (this.loseNextResponse) {
            this.loseNextResponse = false;
            throw new Error('fake_response_lost');
        }
        return structuredClone(receipt);
    }
    resolve(r, state) {
        const k = this.key(r), prior = this.effects.get(k);
        requireThat(prior && prior.requestDigest === digest(r), 'no_pending_operation');
        requireThat(prior.state === 'pending' || prior.state === 'unknown', 'already_final');
        this.effects.set(k, { state, requestDigest: digest(r), effectRef: state === 'confirmed' ? `fake:${++this.effectCount}` : null });
    }
}
