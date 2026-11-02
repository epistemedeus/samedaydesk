import { digest, requireThat } from '../../agent-economy-foundation/dist/index.js';
import { keccak256 } from 'viem';
import { assertSigningAttestation, nonceAuthorityKey } from './network-profile.js';
import { assessFees, holdNative } from './network-fees.js';
import { attestCandidate } from './candidate.js';
export async function sandbox(client) {
    requireThat(await client.getChainId() === 31337, 'sandbox_chain_required');
    const url = new URL(client.transport.url);
    requireThat(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'loopback_rpc_required');
}
function modeOf(authority) { return authority === true || authority === 'sign' ? 'sign' : authority === false || authority === 'observe' ? 'observe' : authority; }
/** Read-only observations may lack declared metadata; authority never may. No chain is inferred. */
export async function checkChainIdentity(client, identity, authority = true) {
    const mode = modeOf(authority);
    requireThat(identity?.assets, 'asset_registry_required');
    const configured = identity.configuredChain, declared = client.chain?.id;
    requireThat(typeof configured === 'string' && /^eip155:[1-9][0-9]*$/.test(configured), 'chain_identity_unknown');
    const networkClass = identity.networkClass ?? 'sandbox';
    requireThat(networkClass === 'sandbox' || networkClass === 'owned-fork' || networkClass === 'public', 'chain_identity_unknown');
    // Absent class keeps the stored v3 sandbox meaning: chain 31337 and loopback HTTP.
    if (networkClass === 'sandbox')
        requireThat(configured === 'eip155:31337', 'chain_identity_mismatch');
    if (mode !== 'observe')
        requireThat(Number.isSafeInteger(declared) && declared > 0, 'chain_identity_unknown');
    if (declared !== undefined)
        requireThat(Number.isSafeInteger(declared) && `eip155:${declared}` === configured, 'chain_identity_mismatch');
    const registered = identity.assets.registration(identity.asset);
    requireThat(registered.asset.chain === configured, 'chain_identity_mismatch');
    let url;
    try {
        url = new URL(client.transport?.url);
    }
    catch {
        requireThat(false, 'chain_identity_unknown');
    }
    requireThat(url, 'chain_identity_unknown');
    const loopback = url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if (networkClass === 'sandbox' || networkClass === 'owned-fork')
        requireThat(loopback, 'loopback_rpc_required');
    else {
        requireThat(url.protocol === 'https:' || url.protocol === 'http:', 'chain_identity_unknown');
        requireThat(!loopback, 'chain_identity_mismatch');
    }
    let live;
    try {
        live = BigInt(await client.request({ method: 'eth_chainId' }, { dedupe: false }));
    }
    catch {
        requireThat(false, 'chain_identity_unknown');
    }
    requireThat(`eip155:${live}` === configured, 'chain_identity_mismatch');
    if ((mode === 'sign' || mode === 'broadcast') && identity.codeHashes) {
        for (const [address, hash] of Object.entries(identity.codeHashes)) {
            let code;
            try {
                code = await client.getCode({ address });
            }
            catch {
                requireThat(false, 'chain_identity_unknown');
            }
            requireThat(code && code.length > 2, 'contract_code_absent');
            requireThat(keccak256(code) === hash, 'contract_runtime_pin');
        }
    }
    if ((mode === 'sign' || mode === 'broadcast') && networkClass === 'public')
        requireThat(identity.candidate && identity.authorizeIntent, 'attestation_stale');
    if (mode !== 'observe' && identity.candidate) {
        requireThat(identity.candidate.chain === configured, 'candidate_identity_changed');
        identity.attestation = await attestCandidate(client, identity.candidate, Date.now(), 3600, networkClass);
    }
    if (mode === 'sign' && identity.attestation)
        assertSigningAttestation(identity.attestation);
}
// This file is the checked-in canonical rail. There is no separate generator.
// withOperation is optional: one awaited callback shares the rail intent id.
// A returned prior intent is not signed again and does not enter that scope.
// The nonce reservation and budget hold commit before the signer. Signed bytes
// commit in a second transition. A reservation without those bytes is unknown
// and is not signed again. A release happens only when this file has not called
// the signer. A property on the thrown error is not that proof.
// A stored signature is returned unchanged. Its old binding is not rewritten.
// An old fund digest of proof suffix and calldata is accepted only when the
// durable allocation, funding operation, and stored payment describe that same
// calldata. A caller-supplied commitment is not historical evidence.
async function scoped(identity, operationId, fn) {
    if (typeof identity?.withOperation !== 'function')
        return await fn();
    return await identity.withOperation({ operationId }, fn);
}
async function releaseReservation(store, spec) {
    if (!spec)
        return;
    await store.frame(() => {
        const row = store.get('tx', spec.id);
        if (!row || row.raw || row.phase !== 'reserved' || row.binding !== spec.binding)
            return;
        if (spec.budgetKey) {
            const budget = store.get('native-budget', spec.budgetKey);
            const held = budget?.holds?.[spec.id];
            if (held !== undefined) {
                const holds = { ...budget.holds };
                delete holds[spec.id];
                store.put('native-budget', spec.budgetKey, { ...budget, remaining: (BigInt(budget.remaining) + BigInt(held)).toString(), holds });
            }
        }
        const nonceRow = store.get('nonce', spec.nonceKey);
        if (nonceRow && nonceRow.next === spec.nonce + 1)
            store.put('nonce', spec.nonceKey, { next: spec.nonce });
        store.remove('fee-estimate', spec.id);
        store.remove('tx', spec.id);
    });
}
function sameHex(left, right) {
    return typeof left === 'string' && typeof right === 'string' && left.toLowerCase() === right.toLowerCase();
}
/** Historical fund rows committed only the proof suffix and calldata. */
function historicalFundBinding(prior) {
    if (!prior || typeof prior.id !== 'string' || !prior.id.startsWith('fund:') || typeof prior.data !== 'string')
        return null;
    return digest({ proofId: prior.id.slice('fund:'.length), data: prior.data });
}
/** The old signature stays stored. The extended identity has to already be in the journal. */
function acceptedHistoricalFund(store, prior, id, binding, data, to) {
    if (!prior || prior.id !== id || !sameHex(prior.data, data) || !sameHex(prior.to, to) || prior.binding !== historicalFundBinding(prior))
        return false;
    const proofId = id.slice('fund:'.length);
    const funding = store.get('funding', proofId);
    const op = store.get('funding-op', proofId);
    if (!funding?.quote || funding.payment === undefined || typeof op?.operationId !== 'string')
        return false;
    const quoteDigest = digest(funding.quote);
    const allocation = store.get('funding-allocation', JSON.stringify([funding.quote.tenantId, funding.quote.canonicalTaskId]));
    if (!allocation || allocation.proofId !== proofId || allocation.quoteDigest !== quoteDigest)
        return false;
    const extended = digest({ proofId, data: prior.data, operationId: op.operationId, quoteDigest, approvalDigest: digest(funding.payment) });
    return binding === extended;
}
function provedNonEntry(_error, invoked) {
    return !invoked;
}
async function retainUnknown(store, id, binding) {
    await store.frame(() => {
        const row = store.get('tx', id);
        requireThat(row && !row.raw && (row.phase === 'reserved' || row.phase === 'unknown') && row.binding === binding, 'signing_unknown');
        if (row.phase !== 'unknown')
            store.put('tx', id, { ...row, phase: 'unknown' });
    });
}
/** Reserve the canonical operation before the signer; persist returned bytes second. */
export async function prepareIntent(store, id, binding, client, signer, to, data, identity) {
    if (store.inTransaction() && !store.directFrames)
        return store.pause(() => prepareIntent(store, id, binding, client, signer, to, data, identity));
    const prior = await store.frame(() => store.get('tx', id));
    if (prior?.raw && prior.txId) {
        if (prior.binding !== binding)
            requireThat(acceptedHistoricalFund(store, prior, id, binding, data, to), 'operation_conflict');
        return prior;
    }
    requireThat(!prior || prior.binding === binding, 'operation_conflict');
    if (prior)
        requireThat(false, 'signing_unknown');
    const networkClass = identity.networkClass ?? 'sandbox';
    if (networkClass === 'public')
        requireThat(identity.candidate && identity.authorizeIntent, 'attestation_stale');
    if (networkClass === 'owned-fork')
        requireThat(store.namespace.kind === 'fork' && !!identity.forkId && store.namespace.forkId === identity.forkId, 'fork_namespace');
    else
        requireThat(store.namespace.kind === 'chain', 'fork_namespace');
    await checkChainIdentity(client, identity, 'sign');
    const chainId = Number(identity.configuredChain.slice('eip155:'.length));
    const nonceKey = nonceAuthorityKey(chainId, signer.address, networkClass === 'owned-fork' ? identity.forkId : undefined);
    const networkNonce = await client.getTransactionCount({ address: signer.address, blockTag: 'pending' });
    const legacy = networkClass === 'sandbox' && !identity.feeLimits;
    let quote = null;
    let estimatedGas = null;
    let gasPrice = null;
    if (legacy) {
        estimatedGas = await client.estimateGas({ account: signer.address, to, data });
        gasPrice = await client.getGasPrice();
    }
    else {
        quote = identity.feeQuoteProvider ? await identity.feeQuoteProvider(data) : identity.feeQuote;
        requireThat(identity.feeLimits && quote, 'fee_estimate_unknown');
        estimatedGas = await client.estimateGas({ account: signer.address, to, data });
    }
    const spec = await store.frame(() => {
        const again = store.get('tx', id);
        requireThat(!again, 'signing_unknown');
        const reserved = store.get('nonce', nonceKey)?.next ?? 0;
        const nonce = Math.max(networkNonce, reserved);
        const row = { id, binding, phase: 'reserved', to, data, nonce };
        if (!legacy) {
            let remaining = identity.nativeBudgetRemaining;
            if (identity.nativeBudgetKey) {
                const budget = store.get('native-budget', identity.nativeBudgetKey);
                requireThat(budget, 'native_budget_exhausted');
                remaining = BigInt(budget.remaining);
            }
            const assessment = assessFees({ limits: identity.feeLimits, estimatedGas, quote, nativeRemaining: remaining });
            if (identity.nativeBudgetKey && assessment.allInEstimate !== null) {
                const budget = store.get('native-budget', identity.nativeBudgetKey);
                store.put('native-budget', identity.nativeBudgetKey, holdNative(budget, id, BigInt(assessment.allInEstimate)));
            }
            store.put('fee-estimate', id, assessment);
        }
        store.put('nonce', nonceKey, { next: nonce + 1 });
        store.put('tx', id, row);
        return { id, binding, nonce, nonceKey, budgetKey: identity.nativeBudgetKey ?? null };
    });
    let raw;
    let signerInvoked = false;
    try {
        raw = await scoped(identity, id, async () => {
            await checkChainIdentity(client, identity, 'sign');
            await identity.authorizeIntent?.('sign', id);
            const sign = () => {
                signerInvoked = true;
                if (legacy)
                    return signer.signTransaction({ chainId: 31337, type: 'legacy', nonce: spec.nonce, gas: estimatedGas, gasPrice, to, data });
                return signer.signTransaction({ chainId, type: 'eip1559', nonce: spec.nonce, gas: identity.feeLimits.gasLimit, maxFeePerGas: identity.feeLimits.maxFeePerGas, maxPriorityFeePerGas: identity.feeLimits.maxPriorityFeePerGas, to, data });
            };
            if (legacy) {
                await checkChainIdentity(client, identity, 'sign');
                await identity.authorizeIntent?.('sign', id);
                return sign();
            }
            await checkChainIdentity(client, identity, 'sign');
            await identity.authorizeIntent?.('sign', id);
            return sign();
        });
    }
    catch (error) {
        if (provedNonEntry(error, signerInvoked)) {
            try {
                await releaseReservation(store, spec);
            }
            catch { /* A failed release keeps the reservation. It does not become a second signature. */ }
            throw error;
        }
        try {
            await retainUnknown(store, id, binding);
        }
        catch { /* Persistence ambiguity keeps the reservation and does not sign again. */ }
        if (error && typeof error === 'object' && !error.code)
            error.code = 'signing_unknown';
        throw error;
    }
    if (typeof identity.faultAfterSign === 'function') {
        await store.frame(() => {
            const row = store.get('tx', id);
            requireThat(row && row.phase === 'reserved' && !row.raw && row.binding === binding, 'signing_unknown');
            store.put('tx', id, { ...row, phase: 'unknown' });
        });
        try {
            await identity.faultAfterSign();
        }
        catch (error) {
            if (error && typeof error === 'object' && !error.code)
                error.code = 'signing_unknown';
            throw error;
        }
        requireThat(false, 'signing_unknown');
    }
    return store.frame(() => {
        const row = store.get('tx', id);
        requireThat(row && row.phase === 'reserved' && !row.raw && row.binding === binding && row.nonce === spec.nonce, 'signing_unknown');
        const intent = { id, binding, phase: 'signed', to, data, nonce: spec.nonce, raw, txId: keccak256(raw) };
        if (identity.candidate && identity.attestation)
            store.put('source-attestation', identity.attestation.ref, identity.attestation);
        if (identity.identityDigest)
            intent.witness = { identityDigest: identity.identityDigest, attestationRef: identity.attestation?.ref ?? '', grantEpoch: identity.grantEpoch ?? 0, configuredChain: identity.configuredChain, networkClass, abiDigest: identity.abiDigest ?? '', ...(identity.authorityDigest ? { authorityDigest: identity.authorityDigest } : {}) };
        store.put('tx', id, intent);
        return intent;
    });
}
export async function broadcast(client, intent, identity) {
    const configuredChain = intent.witness?.configuredChain ?? identity.configuredChain;
    const networkClass = intent.witness?.networkClass ?? identity.networkClass;
    await checkChainIdentity(client, { ...identity, configuredChain, networkClass, attestation: undefined }, 'observe');
    try {
        const receipt = await client.getTransactionReceipt({ hash: intent.txId });
        if (receipt)
            return receipt;
    }
    catch (error) {
        if (error?.name !== 'TransactionReceiptNotFoundError')
            return null;
    }
    let absent = false;
    try {
        absent = !await client.getTransaction({ hash: intent.txId });
    }
    catch (error) {
        if (error?.name === 'TransactionNotFoundError')
            absent = true;
        else
            return null;
    }
    if (absent) {
        await checkChainIdentity(client, { ...identity, configuredChain, networkClass, attestation: undefined }, 'broadcast');
        await scoped(identity, intent.id, async () => {
            await identity.authorizeIntent?.('broadcast', intent.id, intent.witness);
        });
        try {
            await client.sendRawTransaction({ serializedTransaction: intent.raw });
        }
        catch { /* Original signed bytes remain durable; read their hash below. */ }
    }
    try {
        return await client.waitForTransactionReceipt({ hash: intent.txId, timeout: 3000, pollingInterval: 20 });
    }
    catch {
        return null;
    }
}
/** Current receipt/block/reorg notes sit beside the signed bytes and never replace them. */
export function recordObservation(store, id, observation) {
    const prior = store.get('tx', id);
    requireThat(prior, 'intent_absent');
    store.put('tx-observation', id, { ...observation, l1Drift: 'unknown', intentDigest: prior.txId });
    requireThat(store.get('tx', id)?.raw === prior.raw, 'intent_rewritten');
    return store.get('tx-observation', id);
}
