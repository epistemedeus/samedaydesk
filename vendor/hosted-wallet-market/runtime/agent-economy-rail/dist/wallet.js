import { randomBytes, createCipheriv, createDecipheriv, generateKeyPairSync, diffieHellman, createPublicKey, hkdfSync } from 'node:crypto';
import { writeFileSync, readFileSync } from 'node:fs';
import { privateKeyToAccount } from 'viem/accounts';
import { encodeFunctionData, parseAbi } from 'viem';
import { BoundaryError, checked, requireThat, digest, legacyPayoutInstruction, resolveOwnerExportTarget } from '../../agent-economy-foundation/dist/index.js';
import { checkChainIdentity, prepareIntent, broadcast } from './local-chain.js';
import { assertSigningAttestation, eip155ChainId, identityDigestOf } from './network-profile.js';
import { capabilityExtension, joinOperation } from './network-ext.js';
import { reconcileNative } from './network-fees.js';
function encrypt(key, bytes, aad) {
    const nonce = randomBytes(12), c = createCipheriv('aes-256-gcm', key, nonce);
    c.setAAD(Buffer.from(aad));
    const ciphertext = Buffer.concat([c.update(bytes), c.final()]);
    return { nonce: nonce.toString('base64'), ciphertext: ciphertext.toString('base64'), tag: c.getAuthTag().toString('base64') };
}
function decrypt(key, envelope, aad) {
    const c = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.nonce, 'base64'));
    c.setAAD(Buffer.from(aad));
    c.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    return Buffer.concat([c.update(Buffer.from(envelope.ciphertext, 'base64')), c.final()]);
}
const tokenAbi = parseAbi(['function transfer(address to,uint256 value) returns (bool)']);
/** Owner-side sandbox keystore. The embedding owner process supplies auth and an in-memory unlock key. */
export class LocalWalletCapabilities {
    store;
    unlock;
    client;
    now;
    ownerResolver;
    ownerIO;
    assets;
    byow = new Map();
    profile = null;
    /** When set, payout amount and destination come from F1's canonical instruction. */
    allocationSource = null;
    /** Attaches a qualified sandbox or owned-fork profile. Admission is not signer authority. */
    bindProfile(profile) {
        requireThat(profile.signerAuthority === false && profile.status === 'qualified', 'admission_not_signer_authority');
        requireThat(profile.identity.networkClass !== 'public', 'attestation_stale');
        if (profile.identity.networkClass === 'owned-fork')
            requireThat(this.store.namespace.kind === 'fork' && this.store.namespace.forkId === profile.identity.forkId, 'fork_namespace');
        else
            requireThat(this.store.namespace.kind === 'chain', 'fork_namespace');
        this.profile = profile;
    }
    constructor(store, unlock, client, now = () => new Date(), ownerResolver = { async resolve() { throw new Error('owner_resolver_required'); } }, ownerIO, assets) {
        this.store = store;
        this.unlock = unlock;
        this.client = client;
        this.now = now;
        this.ownerResolver = ownerResolver;
        this.ownerIO = ownerIO;
        this.assets = assets;
        requireThat(assets, 'asset_registry_required');
        requireThat(unlock.length === 32, 'unlock_key_length');
    }
    identity(chain, token, asset = { chain, token, decimals: 6, symbol: 'USDC' }) {
        const base = { configuredChain: chain, asset, assets: this.assets };
        if (!this.profile)
            return base;
        requireThat(chain === `eip155:${this.profile.identity.chainId}`, 'identity_changed');
        return { ...base, networkClass: this.profile.identity.networkClass, attestation: this.profile.attestation, codeHashes: this.profile.codeHashes, forkId: this.profile.identity.forkId, identityDigest: this.profile.identityDigest, abiDigest: this.profile.identity.abiDigest, feeLimits: this.profile.feeLimits, feeQuote: this.profile.feeQuote, ...(this.profile.nativeBudget !== undefined ? { nativeBudgetKey: this.profile.identity.signerAccount.toLowerCase(), nativeBudgetRemaining: BigInt(this.profile.nativeBudget) } : {}) };
    }
    id(t, id) { return JSON.stringify([t, id]); }
    entry(a, id) { checked('AuthenticatedActor', a); const e = this.store.get('wallet', this.id(a.tenantId, id)); requireThat(e, 'forbidden'); return e; }
    owner(a, e) { requireThat(a.actorId === e.wallet.ownerId, 'owner_required'); }
    signer(e) {
        if (e.wallet.custody === 'byow') {
            const s = this.byow.get(this.id(e.wallet.tenantId, e.wallet.walletId));
            requireThat(s, 'byow_signer_unavailable');
            return s;
        }
        const bytes = decrypt(this.unlock, e.cipher, digest(e.wallet.address));
        try {
            return privateKeyToAccount(`0x${bytes.toString('hex')}`);
        }
        finally {
            bytes.fill(0);
        }
    }
    async create(a, input) {
        checked('AuthenticatedActor', a);
        const r = checked('WalletCreateRequest', input);
        await checkChainIdentity(this.client, this.identity(r.chain, r.token));
        if (!this.profile)
            requireThat(r.custody === 'local_keystore' && r.chain === 'eip155:31337', 'local_creation_scope');
        else
            requireThat(r.custody === 'local_keystore' && this.profile.identity.networkClass !== 'public' && r.chain === `eip155:${this.profile.identity.chainId}` && (this.profile.identity.networkClass !== 'sandbox' || r.chain === 'eip155:31337'), 'local_creation_scope');
        const id = r.walletId;
        const bytes = randomBytes(32);
        try {
            const signer = privateKeyToAccount(`0x${bytes.toString('hex')}`);
            if (this.profile && this.profile.identity.signerAccount.toLowerCase() !== signer.address.toLowerCase()) {
                requireThat(this.store.all('network-ext').length === 0, 'identity_changed');
                const identity = { ...this.profile.identity, signerAccount: signer.address.toLowerCase() };
                this.profile = { ...this.profile, identity, identityDigest: identityDigestOf(identity) };
            }
            const wallet = checked('WalletV3', { ...r, tenantId: a.tenantId, ownerId: a.actorId, address: signer.address.toLowerCase(), revocationEpoch: 0 });
            await this.store.transaction(() => { requireThat(!this.store.get('wallet', this.id(a.tenantId, id)), 'wallet_exists'); this.store.put('wallet', this.id(a.tenantId, id), { wallet, cipher: encrypt(this.unlock, bytes, digest(wallet.address)) }); });
            return structuredClone(wallet);
        }
        finally {
            bytes.fill(0);
        }
    }
    /** An owner-held F1 signer handle proves control. Its local execution prepares an intent; this port gates broadcast. */
    async enrollByow(a, input, handle) {
        checked('AuthenticatedActor', a);
        const wallet = checked('WalletV3', input);
        await checkChainIdentity(this.client, this.identity(wallet.chain, wallet.token));
        const byowChain = this.profile ? wallet.chain === `eip155:${this.profile.identity.chainId}` && this.profile.identity.networkClass !== 'public' : wallet.chain === 'eip155:31337';
        requireThat(wallet.custody === 'byow' && wallet.tenantId === a.tenantId && wallet.ownerId === a.actorId && wallet.revocationEpoch === 0 && byowChain && handle.address.toLowerCase() === wallet.address.toLowerCase(), 'byow_binding');
        const challenge = `AE14 sandbox BYOW ${digest({ a, wallet, nonce: randomBytes(32).toString('hex') })}`;
        requireThat(await handle.proveControl(challenge), 'byow_control');
        await this.store.transaction(() => this.store.fence('wallet', this.id(a.tenantId, wallet.walletId), { wallet }, 'wallet_conflict'));
        this.byow.set(this.id(a.tenantId, wallet.walletId), handle.signer);
        return wallet;
    }
    async enroll(a, input) {
        const wallet = checked('WalletV3', input), existing = this.entry(a, wallet.walletId);
        this.owner(a, existing);
        requireThat(digest(existing.wallet) === digest(wallet), 'wallet_conflict');
        return structuredClone(existing.wallet);
    }
    async bindAsset(a, id, token) {
        const wallet = this.entry(a, id).wallet;
        await checkChainIdentity(this.client, this.identity(wallet.chain, token));
        await this.store.transaction(() => { const e = this.entry(a, id); this.owner(a, e); requireThat(e.wallet.token === 'unbound' || e.wallet.token === token, 'asset_immutable'); e.wallet.token = token; this.store.put('wallet', this.id(a.tenantId, id), e); });
    }
    async receiveAddress(a, id) { const e = this.entry(a, id); this.owner(a, e); return e.wallet.address; }
    async describe(a, id) { const e = this.entry(a, id); this.owner(a, e); return checked('WalletCapabilityDescriptorV3', { schemaVersion: 'pilot.agent-economy.v3', kind: 'capability_descriptor', wallet: structuredClone(e.wallet), capabilities: this.store.all('capability').filter(c => c.tenantId === a.tenantId && c.walletId === id) }); }
    async grant(a, input) {
        const c = checked('Capability', input), wallet = this.entry(a, c.walletId).wallet;
        await checkChainIdentity(this.client, this.identity(wallet.chain, wallet.token));
        await this.store.transaction(() => {
            const e = this.entry(a, c.walletId);
            this.owner(a, e);
            requireThat(c.operation !== 'refund', 'wallet_refund_requires_rail');
            requireThat(c.tenantId === a.tenantId && c.chain === e.wallet.chain && c.token === e.wallet.token && c.revocationEpoch === e.wallet.revocationEpoch, 'capability_binding');
            requireThat(BigInt(c.maxAmount) <= BigInt(c.cumulativeBudget) && Date.parse(c.expiresAt) > this.now().getTime(), 'capability_budget_expiry');
            this.store.fence('capability', this.id(a.tenantId, c.capabilityId), c, 'capability_conflict');
            if (this.profile) {
                requireThat(e.wallet.address.toLowerCase() === this.profile.identity.signerAccount.toLowerCase(), 'identity_changed');
                const ext = capabilityExtension({ capabilityId: c.capabilityId, identityDigest: this.profile.identityDigest, attestationRef: this.profile.attestation.ref, grantEpoch: e.wallet.revocationEpoch, feeLimits: this.profile.feeLimits ? { gasLimit: this.profile.feeLimits.gasLimit.toString(), maxFeePerGas: this.profile.feeLimits.maxFeePerGas.toString(), maxPriorityFeePerGas: this.profile.feeLimits.maxPriorityFeePerGas.toString() } : null, nativeBudget: this.profile.nativeBudget ?? '0' });
                this.store.put('network-ext', this.id(a.tenantId, c.capabilityId), ext);
                const budgetKey = this.profile.identity.signerAccount.toLowerCase();
                if (this.profile.nativeBudget !== undefined && !this.store.get('native-budget', budgetKey))
                    this.store.put('native-budget', budgetKey, { remaining: this.profile.nativeBudget, spent: '0', holds: {}, unknown: [] });
            }
        });
        return c;
    }
    /** Opt-in. Inherited sandbox payouts stay caller-scoped until a canonical allocation source is bound. */
    bindAllocationSource(source) {
        requireThat(source && typeof source.obligation === 'function', 'payout_not_bound');
        this.allocationSource = source;
    }
    /** Refuse before a fence write when the caller disagrees with the canonical instruction. */
    async instructionFor(a, allocationId, target, amount) {
        if (!this.allocationSource)
            return { target, amount };
        const obligation = await this.allocationSource.obligation(a.tenantId, allocationId);
        requireThat(obligation, 'payout_not_bound');
        let instruction;
        try {
            instruction = legacyPayoutInstruction(obligation, await this.allocationSource.observed?.(a, allocationId));
        }
        catch (error) {
            if (error instanceof BoundaryError)
                throw new BoundaryError('payout_not_bound');
            throw error;
        }
        requireThat(instruction.payoutDestination === target && instruction.amount === amount && instruction.platformFee === '0', 'payout_not_bound');
        return { target, amount: instruction.amount };
    }
    /** Fixed destination and owed amount are bound by the owner BEFORE signing; allocation fence survives rotation/recovery. */
    async bindPayout(a, walletId, allocationId, target, amount) {
        requireThat(typeof amount === 'string' && /^[0-9]+$/.test(amount) && BigInt(amount) > 0n, 'payout_not_bound');
        const wallet = this.entry(a, walletId).wallet;
        const bound = await this.instructionFor(a, allocationId, target, amount);
        if (this.allocationSource) {
            const existing = this.store.get('payout-binding', this.id(a.tenantId, allocationId));
            requireThat(!existing || (existing.target === bound.target && existing.amount === bound.amount && existing.chain === wallet.chain && existing.token === wallet.token), 'payout_not_bound');
        }
        await checkChainIdentity(this.client, this.identity(wallet.chain, wallet.token));
        await this.store.transaction(() => { const e = this.entry(a, walletId); this.owner(a, e); this.store.fence('payout-binding', this.id(a.tenantId, allocationId), { target: bound.target, chain: e.wallet.chain, token: e.wallet.token, amount: bound.amount }, 'payout_destination_immutable'); });
    }
    async bindFunding(a, walletId, r, typedData) {
        checked('OperationRequest', r);
        const wallet = this.entry(a, walletId).wallet;
        await checkChainIdentity(this.client, this.identity(wallet.chain, wallet.token, r.asset));
        await this.store.transaction(() => {
            const e = this.entry(a, walletId);
            this.owner(a, e);
            requireThat(r.tenantId === a.tenantId && r.kind === 'fund' && r.asset.chain === e.wallet.chain && r.asset.token === e.wallet.token && typedData.domain.chainId === eip155ChainId(e.wallet.chain) && typedData.domain.verifyingContract === e.wallet.token && typedData.primaryType === 'ReceiveWithAuthorization' && typedData.message.from.toLowerCase() === e.wallet.address.toLowerCase() && typedData.message.value === BigInt(r.amount), 'funding_binding');
            // JSON codec stores bigint as strings; the only allowed type/value is checked again at signing.
            const data = JSON.parse(JSON.stringify(typedData, (_, v) => typeof v === 'bigint' ? v.toString() : v));
            this.store.fence('fund-data', this.id(r.tenantId, r.operationId), { walletId, requestDigest: digest(r), data }, 'funding_binding');
        });
    }
    boundPayout(r) {
        const bound = this.store.get('payout-binding', this.id(r.tenantId, r.allocationId));
        requireThat(bound && bound.target === r.target && bound.token === r.asset.token && bound.chain === r.asset.chain && bound.amount === r.amount, 'payout_not_bound');
    }
    live(a, c, r, e) {
        requireThat(r.tenantId === a.tenantId && r.actorId === a.actorId && r.authorityId === c.capabilityId && c.delegateId === a.actorId, 'forbidden');
        requireThat(c.revocationEpoch === e.wallet.revocationEpoch, 'capability_revoked');
        requireThat(this.now().getTime() < Date.parse(c.expiresAt), 'capability_expired');
        requireThat(r.asset.chain === c.chain && r.asset.token === c.token && r.asset.decimals === 6 && r.asset.symbol === 'USDC' && r.kind === c.operation && r.target === c.target, 'capability_scope');
        requireThat(BigInt(r.amount) > 0n && BigInt(r.amount) <= BigInt(c.maxAmount), 'amount_limit');
        // Material identity change refuses. A refreshed attestation keeps the same digest and does not.
        if (this.profile) {
            const ext = this.store.get('network-ext', this.id(a.tenantId, c.capabilityId));
            requireThat(ext && ext.schema === 'ae14.rail-network-ext.v1', 'identity_changed');
            const requalified = this.store.get('requalification', this.profile.identityDigest);
            requireThat(ext.identityDigest === this.profile.identityDigest || requalified?.explicit === true, 'identity_changed');
        }
    }
    async boundedSigner(a, id) {
        a = checked('AuthenticatedActor', a);
        const c = this.store.get('capability', this.id(a.tenantId, id));
        requireThat(c && c.delegateId === a.actorId, 'signer_denied');
        return { sign: async (input) => {
                const r = checked('OperationRequest', input), key = this.id(r.tenantId, r.operationId);
                const wallet = this.entry(a, c.walletId).wallet;
                await checkChainIdentity(this.client, this.identity(wallet.chain, wallet.token, r.asset));
                const op = await this.store.transaction(async () => {
                    const e = this.entry(a, c.walletId);
                    this.live(a, c, r, e);
                    const prior = this.store.get('wallet-op', key);
                    requireThat(!prior || digest(prior.request) === digest(r), 'operation_conflict');
                    if (prior)
                        return prior;
                    // A changed canonical amount refuses before the signer, the intent, or the allocation fence.
                    if (r.kind === 'payout') {
                        await this.instructionFor(a, r.allocationId, r.target, r.amount);
                        this.boundPayout(r);
                    }
                    const allocKey = this.id(r.tenantId, `${r.kind}:${r.allocationId}`);
                    const priorFence = this.store.get('wallet-allocation', allocKey);
                    if (priorFence && priorFence.operationId !== r.operationId) {
                        const priorOp = this.store.get('wallet-op', this.id(r.tenantId, priorFence.operationId));
                        requireThat(priorOp?.receipt.state === 'failed', 'allocation_operation_conflict');
                        this.store.put('wallet-allocation', allocKey, { operationId: r.operationId });
                    }
                    else
                        this.store.fence('wallet-allocation', allocKey, { operationId: r.operationId }, 'allocation_operation_conflict');
                    if (this.profile)
                        assertSigningAttestation(this.profile.attestation);
                    // All grants on a wallet share one durable cumulative purse; a new grant cannot reset consumption.
                    // An observed revert did not move tokens, so it does not consume the purse. Unknown stays counted.
                    const spent = this.store.all('wallet-op').filter(o => o.request.tenantId === a.tenantId && o.walletId === c.walletId && o.receipt.state !== 'failed').reduce((n, o) => n + BigInt(o.request.amount), 0n);
                    requireThat(spent + BigInt(r.amount) <= BigInt(c.cumulativeBudget), 'cumulative_limit');
                    const row = { request: r, walletId: c.walletId, receipt: { state: 'unknown', requestDigest: digest(r), effectRef: null } };
                    const signer = this.signer(e);
                    if (e.wallet.custody === 'byow') {
                        if (r.kind === 'payout')
                            this.boundPayout(r);
                        const receipt = await signer.sign(r);
                        requireThat(receipt.requestDigest === digest(r), 'byow_receipt_binding');
                        const prepared = this.store.get('tx', `wallet:${key}`);
                        if (r.kind === 'payout') {
                            requireThat(prepared && prepared.binding === digest(r), 'byow_intent_required');
                            row.txId = prepared.txId;
                        }
                        else {
                            row.signature = this.store.get('byow-signature', key)?.signature;
                            requireThat(row.signature, 'byow_authorization_required');
                            row.receipt = receipt;
                        }
                    }
                    else if (r.kind === 'fund') {
                        const bound = this.store.get('fund-data', key);
                        requireThat(bound && bound.walletId === c.walletId && bound.requestDigest === digest(r), 'funding_not_bound');
                        const td = bound.data;
                        for (const field of ['value', 'validAfter', 'validBefore'])
                            td.message[field] = BigInt(td.message[field]);
                        requireThat(td.domain.name === 'USD Coin' && td.domain.version === '2' && td.message.validAfter === 0n && td.message.validBefore * 1000n <= BigInt(Date.parse(c.expiresAt)), 'funding_signature_expiry');
                        this.live(a, c, r, this.entry(a, c.walletId));
                        await checkChainIdentity(this.client, this.identity(e.wallet.chain, e.wallet.token, r.asset));
                        row.signature = await signer.signTypedData(td);
                        row.receipt = { state: 'pending', requestDigest: digest(r), effectRef: `signature:${digest(row.signature)}` };
                    }
                    else {
                        requireThat(r.kind === 'payout', 'wallet_refund_requires_rail');
                        this.boundPayout(r);
                        const data = encodeFunctionData({ abi: tokenAbi, functionName: 'transfer', args: [r.target, BigInt(r.amount)] });
                        const intent = await prepareIntent(this.store, `wallet:${key}`, digest(r), this.client, signer, r.asset.token, data, { ...this.identity(e.wallet.chain, e.wallet.token, r.asset), grantEpoch: e.wallet.revocationEpoch });
                        this.live(a, c, r, this.entry(a, c.walletId));
                        row.txId = intent.txId;
                        if (this.profile)
                            joinOperation(this.store, a.tenantId, r.operationId, this.store.get('network-ext', this.id(a.tenantId, c.capabilityId)));
                    }
                    this.store.put('wallet-op', key, row);
                    return row;
                });
                if (op.request.kind === 'fund')
                    return op.receipt;
                // Epoch checked immediately before broadcast. Revocation cannot cancel an already broadcast transaction.
                await this.store.transaction(async () => { const e = this.entry(a, c.walletId); this.live(a, c, r, e); const intent = this.store.get('tx', `wallet:${key}`); await broadcast(this.client, intent, this.identity(e.wallet.chain, e.wallet.token, r.asset)); });
                return this.observeOperation(a, r.operationId);
            } };
    }
    async authorizationData(a, operationId) {
        const row = this.store.get('wallet-op', this.id(a.tenantId, operationId));
        requireThat(row && row.request.actorId === a.actorId && row.signature, 'forbidden');
        return row.signature;
    }
    async revoke(a, id) {
        return this.store.transaction(() => { const e = this.entry(a, id); this.owner(a, e); e.wallet.revocationEpoch++; this.store.put('wallet', this.id(a.tenantId, id), e); return e.wallet.revocationEpoch; });
    }
    async rotate(a, id, input) { const e = this.entry(a, id); this.owner(a, e); requireThat(input.walletId !== id, 'wallet_conflict'); const next = await this.create(a, input); await this.revoke(a, id); return next; }
    async export(a, id, target) {
        const e = this.entry(a, id);
        this.owner(a, e);
        requireThat(e.wallet.custody === 'local_keystore', 'byow_export_owner_route');
        const resolved = await resolveOwnerExportTarget(this.ownerResolver, a, target);
        requireThat(this.ownerIO, 'owner_artifact_io_required');
        const recipientPublicKey = await this.ownerIO.publicRecipient(resolved.publicRecipientRef), path = await this.ownerIO.sink(resolved.artifactSinkRef);
        const ephemeral = generateKeyPairSync('x25519'), shared = diffieHellman({ privateKey: ephemeral.privateKey, publicKey: recipientPublicKey });
        const key = Buffer.from(hkdfSync('sha256', shared, Buffer.alloc(0), Buffer.from('AE14 owner export v1'), 32));
        const aad = digest({ wallet: e.wallet, target }), bytes = decrypt(this.unlock, e.cipher, digest(e.wallet.address));
        try {
            writeFileSync(path, JSON.stringify({ wallet: e.wallet, target, aad, ephemeral: ephemeral.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'), envelope: encrypt(key, bytes, aad) }), { mode: 0o600, flag: 'wx' });
        }
        finally {
            bytes.fill(0);
            key.fill(0);
            shared.fill(0);
        }
        const envelopeRef = `local-keystore:${digest({ resolved, walletId: id })}`;
        await this.store.transaction(() => this.store.fence('owner-envelope', envelopeRef, { walletId: id, tenantId: a.tenantId, ownerId: a.actorId, resolved }, 'envelope_conflict'));
        return checked('EncryptedExportResultV3', { schemaVersion: 'pilot.agent-economy.v3', kind: 'encrypted_export', provenance: 'local_keystore', custody: 'local_keystore', walletId: id, tenantId: a.tenantId, ownerId: a.actorId, ownerRecipientRef: target.ownerRecipientRef, envelopeRef, providerRetainsCopy: true });
    }
    async import(a, input) {
        const r = checked('OwnerEnvelopeImport', input), existing = this.entry(a, r.walletId);
        this.owner(a, existing);
        const resolved = await resolveOwnerExportTarget(this.ownerResolver, a, { ownerRecipientRef: r.ownerRecipientRef });
        const saved = this.store.get('owner-envelope', r.envelopeRef);
        requireThat(saved && saved.walletId === r.walletId && saved.tenantId === a.tenantId && saved.ownerId === a.actorId && digest(saved.resolved) === digest(resolved), 'export_owner_binding');
        requireThat(this.ownerIO, 'owner_artifact_io_required');
        const material = await this.ownerIO.open(resolved.artifactSinkRef, resolved.publicRecipientRef), path = material.path, recipientPrivateKey = material.recipient;
        const obj = JSON.parse(readFileSync(path, 'utf8'));
        checked('WalletV3', obj.wallet);
        requireThat(obj.wallet.walletId === r.walletId && obj.target.ownerRecipientRef === r.ownerRecipientRef, 'export_owner_binding');
        requireThat(obj.wallet.tenantId === a.tenantId && obj.wallet.ownerId === a.actorId && digest({ wallet: obj.wallet, target: obj.target }) === obj.aad, 'export_owner_binding');
        const shared = diffieHellman({ privateKey: recipientPrivateKey, publicKey: createPublicKey({ key: Buffer.from(obj.ephemeral, 'base64'), format: 'der', type: 'spki' }) });
        const key = Buffer.from(hkdfSync('sha256', shared, Buffer.alloc(0), Buffer.from('AE14 owner export v1'), 32));
        const bytes = decrypt(key, obj.envelope, obj.aad);
        try {
            const signer = privateKeyToAccount(`0x${bytes.toString('hex')}`);
            requireThat(signer.address.toLowerCase() === obj.wallet.address.toLowerCase(), 'recovery_address');
            await this.store.transaction(() => {
                const existing = this.entry(a, obj.wallet.walletId);
                this.owner(a, existing);
                requireThat(existing.wallet.address === obj.wallet.address, 'recovery_no_redirect');
                // Use the current epoch and existing journal, never roll policy or budgets back to export time.
                existing.cipher = encrypt(this.unlock, bytes, digest(existing.wallet.address));
                this.store.put('wallet', this.id(a.tenantId, obj.wallet.walletId), existing);
            });
        }
        finally {
            bytes.fill(0);
            key.fill(0);
            shared.fill(0);
        }
        return this.recoverWallet(a, obj.wallet.walletId);
    }
    async recoverWallet(a, id) {
        const e = this.entry(a, id);
        requireThat([e.wallet.ownerId, e.wallet.recoveryId].includes(a.actorId), 'wallet_recovery_denied');
        return checked('WalletRecoveryResultV3', { schemaVersion: 'pilot.agent-economy.v3', kind: 'wallet_recovery', provenance: e.wallet.custody, custody: e.wallet.custody, walletId: id, tenantId: a.tenantId, ownerId: e.wallet.ownerId, revocationEpoch: e.wallet.revocationEpoch, operationLineage: this.store.all('wallet-op').filter(o => o.request.tenantId === a.tenantId && o.walletId === id).map(o => ({ operationId: o.request.operationId, requestDigest: digest(o.request), state: o.receipt.state })) });
    }
    async observeOperation(a, id) {
        checked('AuthenticatedActor', a);
        const key = this.id(a.tenantId, id), row = this.store.get('wallet-op', key);
        requireThat(row && row.request.actorId === a.actorId, 'forbidden');
        if (!row.txId)
            return row.receipt;
        try {
            const wallet = this.entry(a, row.walletId).wallet;
            await checkChainIdentity(this.client, this.identity(wallet.chain, wallet.token, row.request.asset), false);
            const receipt = await this.client.getTransactionReceipt({ hash: row.txId });
            const block = await this.client.getBlock({ blockNumber: receipt.blockNumber });
            requireThat(receipt.blockHash === block.hash && (!row.blockHash || row.blockHash === receipt.blockHash), 'wallet_reorg');
            row.blockHash = receipt.blockHash;
            row.blockNumber = receipt.blockNumber.toString();
            row.receipt = { state: receipt.status === 'success' ? 'confirmed' : 'failed', requestDigest: digest(row.request), effectRef: row.txId };
            if (this.profile?.nativeBudget !== undefined) {
                const gasKnown = typeof receipt.gasUsed === 'bigint' && typeof receipt.effectiveGasPrice === 'bigint';
                const l1Known = typeof receipt.l1Fee === 'bigint', operatorKnown = typeof receipt.operatorFee === 'bigint';
                const actual = gasKnown && l1Known && operatorKnown ? receipt.gasUsed * receipt.effectiveGasPrice + receipt.l1Fee + receipt.operatorFee : null;
                const budgetKey = this.profile.identity.signerAccount.toLowerCase();
                const holdId = `wallet:${JSON.stringify([a.tenantId, id])}`;
                const budget = this.store.get('native-budget', budgetKey);
                if (budget?.holds?.[holdId])
                    this.store.put('native-budget', budgetKey, reconcileNative(budget, holdId, actual).row);
                this.store.put('tx-observation', holdId, { l1Drift: 'unknown', actual: actual === null ? null : actual.toString(), l1Actual: l1Known ? receipt.l1Fee.toString() : null, operatorActual: operatorKnown ? receipt.operatorFee.toString() : null });
            }
        }
        catch {
            row.receipt = { state: 'unknown', requestDigest: digest(row.request), effectRef: row.txId };
        }
        await this.store.transaction(() => this.store.put('wallet-op', key, row));
        return row.receipt;
    }
}
