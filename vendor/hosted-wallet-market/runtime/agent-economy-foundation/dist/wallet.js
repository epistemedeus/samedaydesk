import { checked, checkedWallet, immutable, requireThat } from './contracts.js';
import { atomic } from './money.js';
import { digest, MemoryOperationJournal, OperationRecovery, FakeEffectAdapter } from './operations.js';
export async function resolveOwnerExportTarget(resolver, actor, target) {
    const a = immutable(checked('AuthenticatedActor', actor)), t = immutable(checked('OwnerExportTargetContract', target));
    const resolved = checked('ResolvedOwnerExportTarget', await resolver.resolve(a, t));
    requireThat(resolved.tenantId === a.tenantId && resolved.ownerId === a.actorId && resolved.ownerRecipientRef === t.ownerRecipientRef, 'owner_resolver_binding');
    return immutable(resolved);
}
/** No chain/key SDK. Root and recovery are separately authenticated and may override delegated policy. */
export class FakeWalletCapabilities {
    now;
    ownerResolver;
    wallets = new Map();
    grants = new Map();
    held = new Map();
    effects = new FakeEffectAdapter();
    journal = new MemoryOperationJournal();
    envelopes = new Map();
    constructor(now = () => new Date(), ownerResolver = {
        async resolve(a, target) {
            return { tenantId: a.tenantId, ownerId: a.actorId, ownerRecipientRef: target.ownerRecipientRef,
                publicRecipientRef: `fake:recipient:${digest(target).slice(0, 24)}`, artifactSinkRef: `fake:sink:${digest({ a, target }).slice(0, 24)}` };
        },
    }) {
        this.now = now;
        this.ownerResolver = ownerResolver;
    }
    async resolvedOwner(a, target) {
        return resolveOwnerExportTarget(this.ownerResolver, a, target);
    }
    async create(actor, input) {
        checked('AuthenticatedActor', actor);
        const r = checked('WalletCreateRequest', input);
        requireThat(r.custody.startsWith('fake_'), 'fake_custody_only');
        const w = checked('WalletV3', { schemaVersion: r.schemaVersion, walletId: r.walletId, tenantId: actor.tenantId, ownerId: actor.actorId,
            rootId: r.rootId, recoveryId: r.recoveryId, chain: r.chain, token: r.token, custody: r.custody, revocationEpoch: 0, address: `fake:receive:${r.walletId}` });
        await this.enroll(actor, w);
        return w;
    }
    async enrollByow(actor, wallet, _signer) {
        checked('AuthenticatedActor', actor);
        checked('WalletV3', wallet);
        requireThat(false, 'fake_custody_only'); // A owns actual signer-handle enrollment and control proof.
    }
    async rotate(a, id, replacement) {
        const w = this.wallet(a, id);
        requireThat(a.actorId === w.ownerId, 'owner_required');
        const r = checked('WalletCreateRequest', replacement);
        requireThat(r.custody.startsWith('fake_'), 'fake_custody_only');
        requireThat(r.walletId !== id && !this.wallets.has(this.key(a.tenantId, r.walletId)), 'wallet_conflict');
        const created = await this.create(a, r);
        await this.revoke(a, id);
        return created;
    }
    async import(a, input) {
        const r = checked('OwnerEnvelopeImport', input), w = this.wallet(a, r.walletId);
        requireThat(a.actorId === w.ownerId, 'owner_required');
        await this.resolvedOwner(a, { ownerRecipientRef: r.ownerRecipientRef });
        const envelope = this.envelopes.get(r.envelopeRef);
        requireThat(envelope && envelope.walletId === w.walletId && envelope.tenantId === a.tenantId && envelope.ownerId === a.actorId &&
            envelope.ownerRecipientRef === r.ownerRecipientRef, 'export_owner_binding');
        // Fake retained envelope only; preserve current epoch, destinations, budgets and operation journal.
        return this.recoverWallet(a, w.walletId);
    }
    key(t, id) { return JSON.stringify([t, id]); }
    wallet(actorInput, id) {
        const a = checked('AuthenticatedActor', actorInput), w = this.wallets.get(this.key(a.tenantId, id));
        requireThat(w, 'forbidden');
        return w;
    }
    control(a, w) {
        requireThat([w.ownerId, w.rootId, w.recoveryId].includes(a.actorId), 'wallet_control_denied');
    }
    async enroll(actor, input) {
        checked('AuthenticatedActor', actor);
        const w = checkedWallet(input);
        requireThat(w.custody.startsWith('fake_'), 'fake_custody_only');
        requireThat(actor.tenantId === w.tenantId && actor.actorId === w.ownerId && w.revocationEpoch === 0, 'forbidden');
        const k = this.key(w.tenantId, w.walletId), prior = this.wallets.get(k);
        requireThat(!prior || digest(prior) === digest(w), 'wallet_conflict');
        this.wallets.set(k, w);
        return structuredClone(w);
    }
    async receiveAddress(a, walletId) {
        const w = this.wallet(a, walletId);
        this.control(a, w);
        return w.address;
    }
    async grant(a, input) {
        const c = checked('Capability', input), w = this.wallet(a, c.walletId);
        this.control(a, w);
        requireThat(c.tenantId === w.tenantId && c.chain === w.chain && c.token === w.token && c.revocationEpoch === w.revocationEpoch, 'capability_binding');
        requireThat(atomic(c.maxAmount) <= atomic(c.cumulativeBudget), 'capability_budget');
        requireThat(Date.parse(c.expiresAt) > this.now().getTime(), 'capability_expired');
        const k = this.key(c.tenantId, c.capabilityId), prior = this.grants.get(k);
        requireThat(!prior || digest(prior) === digest(c), 'capability_conflict');
        this.grants.set(k, c);
        return immutable(structuredClone(c));
    }
    async boundedSigner(a, capabilityId) {
        checked('AuthenticatedActor', a);
        const c = this.grants.get(this.key(a.tenantId, capabilityId));
        requireThat(c && c.delegateId === a.actorId, 'signer_denied');
        // Capture an immutable identity, not the caller's mutable object.
        const actor = structuredClone(a);
        return { sign: async (input) => {
                const r = checked('OperationRequest', input), w = this.wallet(actor, c.walletId);
                requireThat(r.tenantId === actor.tenantId && r.actorId === actor.actorId && r.authorityId === c.capabilityId, 'forbidden');
                requireThat(c.revocationEpoch === w.revocationEpoch, 'capability_revoked');
                requireThat(this.now().getTime() < Date.parse(c.expiresAt), 'capability_expired');
                requireThat(r.asset.chain === c.chain && r.asset.token === c.token && r.kind === c.operation && r.target === c.target, 'capability_scope');
                const amount = atomic(r.amount), k = this.key(r.tenantId, r.operationId), prior = this.held.get(k);
                requireThat(amount <= atomic(c.maxAmount), 'amount_limit');
                requireThat(!prior || prior.hash === digest(r), 'operation_conflict');
                const used = [...this.held.values()].filter(x => x.capabilityId === this.key(c.tenantId, c.capabilityId)).reduce((n, x) => n + x.amount, 0n);
                requireThat(prior || used + amount <= atomic(c.cumulativeBudget), 'cumulative_limit');
                if (!prior)
                    this.held.set(k, { capabilityId: this.key(c.tenantId, c.capabilityId), hash: digest(r), amount });
                const live = () => {
                    requireThat(c.revocationEpoch === this.wallet(actor, c.walletId).revocationEpoch, 'capability_revoked');
                    requireThat(this.now().getTime() < Date.parse(c.expiresAt), 'capability_expired');
                };
                const effects = this.effects;
                const recovery = new OperationRecovery(this.journal, {
                    async readback(request) { return effects.readback(request); },
                    async submit(request) { live(); return effects.submit(request); },
                });
                const receipt = await recovery.recover(actor, r);
                if (receipt.state === 'failed')
                    this.held.delete(k);
                return receipt;
            } };
    }
    /** Exercised only by fakes. Real W1 must independently authenticate this more powerful route. */
    async rootOrRecoverySign(a, walletId, input) {
        const w = this.wallet(a, walletId), r = checked('OperationRequest', input);
        requireThat(a.actorId === w.rootId || a.actorId === w.recoveryId, 'root_authority_denied');
        requireThat(r.tenantId === a.tenantId && r.actorId === a.actorId && r.authorityId === w.walletId &&
            r.asset.chain === w.chain && r.asset.token === w.token, 'root_binding');
        return new OperationRecovery(this.journal, this.effects).recover(a, r);
    }
    async revoke(a, id) {
        const w = this.wallet(a, id);
        this.control(a, w);
        w.revocationEpoch++;
        return w.revocationEpoch;
    }
    async describe(a, id) {
        const w = this.wallet(a, id);
        this.control(a, w);
        const v3 = w.schemaVersion === 'pilot.agent-economy.v3';
        return checked(v3 ? 'WalletCapabilityDescriptorV3' : 'WalletCapabilityDescriptor', { schemaVersion: v3 ? 'pilot.agent-economy.v3' : 'pilot.agent-economy.v2', kind: 'capability_descriptor', wallet: w,
            capabilities: [...this.grants.values()].filter(c => c.tenantId === w.tenantId && c.walletId === w.walletId) });
    }
    async export(a, id, target) {
        const w = this.wallet(a, id);
        requireThat(a.actorId === w.ownerId, 'owner_export_required');
        const resolved = await this.resolvedOwner(a, target), v3 = w.schemaVersion === 'pilot.agent-economy.v3';
        const envelopeRef = `fake:encrypted-envelope:${digest({ wallet: w, resolved }).slice(0, 32)}`;
        this.envelopes.set(envelopeRef, { walletId: id, tenantId: w.tenantId, ownerId: w.ownerId, ownerRecipientRef: resolved.ownerRecipientRef });
        // Synthetic owner-directed envelope reference only. No keys, plaintext or cryptographic claims.
        return checked(v3 ? 'EncryptedExportResultV3' : 'EncryptedExportResult', { schemaVersion: v3 ? 'pilot.agent-economy.v3' : 'pilot.agent-economy.v2', kind: 'encrypted_export', provenance: 'fake', ...(v3 ? { custody: w.custody } : {}),
            walletId: id, tenantId: w.tenantId, ownerId: w.ownerId, ownerRecipientRef: resolved.ownerRecipientRef,
            envelopeRef, providerRetainsCopy: true });
    }
    async recoverWallet(a, id) {
        const w = this.wallet(a, id);
        requireThat(a.actorId === w.ownerId || a.actorId === w.recoveryId, 'wallet_recovery_denied');
        const records = this.journal.records(w.tenantId).filter(r => r.request.authorityId === w.walletId ||
            this.grants.get(this.key(w.tenantId, r.request.authorityId))?.walletId === w.walletId);
        const v3 = w.schemaVersion === 'pilot.agent-economy.v3';
        return checked(v3 ? 'WalletRecoveryResultV3' : 'WalletRecoveryResult', { schemaVersion: v3 ? 'pilot.agent-economy.v3' : 'pilot.agent-economy.v2', kind: 'wallet_recovery', provenance: 'fake', ...(v3 ? { custody: w.custody } : {}),
            walletId: id, tenantId: w.tenantId, ownerId: w.ownerId, revocationEpoch: w.revocationEpoch,
            operationLineage: records.map(r => ({ operationId: r.request.operationId, requestDigest: r.requestDigest, state: r.receipt.state })) });
    }
    async observeOperation(a, operationId) {
        // Original actor owns this journal entry even if its signing grant has expired or been revoked.
        return new OperationRecovery(this.journal, this.effects).observe(a, operationId);
    }
}
