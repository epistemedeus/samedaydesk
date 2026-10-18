import { requireThat } from '../../agent-economy-foundation/dist/index.js';
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
/** Persist the exact signed transaction before broadcast; retries never allocate another nonce. */
export async function prepareIntent(store, id, binding, client, signer, to, data, identity) {
    return store.transaction(async () => {
        const prior = store.get('tx', id);
        requireThat(!prior || prior.binding === binding, 'operation_conflict');
        if (prior)
            return prior;
        const networkClass = identity.networkClass ?? 'sandbox';
        if (networkClass === 'public')
            requireThat(identity.candidate && identity.authorizeIntent, 'attestation_stale');
        if (networkClass === 'owned-fork')
            requireThat(store.namespace.kind === 'fork' && !!identity.forkId && store.namespace.forkId === identity.forkId, 'fork_namespace');
        else
            requireThat(store.namespace.kind === 'chain', 'fork_namespace');
        await checkChainIdentity(client, identity, 'sign');
        await identity.authorizeIntent?.('sign', id);
        if (identity.candidate && identity.attestation)
            store.put('source-attestation', identity.attestation.ref, identity.attestation);
        const chainId = Number(identity.configuredChain.slice('eip155:'.length));
        const nonceKey = nonceAuthorityKey(chainId, signer.address, networkClass === 'owned-fork' ? identity.forkId : undefined);
        const networkNonce = await client.getTransactionCount({ address: signer.address, blockTag: 'pending' });
        const reserved = store.get('nonce', nonceKey)?.next ?? 0;
        const nonce = Math.max(networkNonce, reserved);
        let raw;
        if (networkClass === 'sandbox' && !identity.feeLimits) {
            const gas = await client.estimateGas({ account: signer.address, to, data });
            const gasPrice = await client.getGasPrice();
            await checkChainIdentity(client, identity, 'sign');
            await identity.authorizeIntent?.('sign', id);
            raw = await signer.signTransaction({ chainId: 31337, type: 'legacy', nonce, gas, gasPrice, to, data });
        }
        else {
            const feeQuote = identity.feeQuoteProvider ? await identity.feeQuoteProvider(data) : identity.feeQuote;
            requireThat(identity.feeLimits && feeQuote, 'fee_estimate_unknown');
            const estimatedGas = await client.estimateGas({ account: signer.address, to, data });
            let remaining = identity.nativeBudgetRemaining;
            if (identity.nativeBudgetKey) {
                const row = store.get('native-budget', identity.nativeBudgetKey);
                requireThat(row, 'native_budget_exhausted');
                remaining = BigInt(row.remaining);
            }
            const assessment = assessFees({ limits: identity.feeLimits, estimatedGas, quote: feeQuote, nativeRemaining: remaining });
            await checkChainIdentity(client, identity, 'sign');
            await identity.authorizeIntent?.('sign', id);
            raw = await signer.signTransaction({ chainId, type: 'eip1559', nonce, gas: identity.feeLimits.gasLimit, maxFeePerGas: identity.feeLimits.maxFeePerGas, maxPriorityFeePerGas: identity.feeLimits.maxPriorityFeePerGas, to, data });
            if (identity.nativeBudgetKey && assessment.allInEstimate !== null) {
                const row = store.get('native-budget', identity.nativeBudgetKey);
                store.put('native-budget', identity.nativeBudgetKey, holdNative(row, id, BigInt(assessment.allInEstimate)));
            }
            store.put('fee-estimate', id, assessment);
        }
        const intent = { id, binding, raw, txId: keccak256(raw) };
        if (identity.identityDigest)
            intent.witness = { identityDigest: identity.identityDigest, attestationRef: identity.attestation?.ref ?? '', grantEpoch: identity.grantEpoch ?? 0, configuredChain: identity.configuredChain, networkClass, abiDigest: identity.abiDigest ?? '', ...(identity.authorityDigest ? { authorityDigest: identity.authorityDigest } : {}) };
        store.put('nonce', nonceKey, { next: nonce + 1 });
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
        await identity.authorizeIntent?.('broadcast', intent.id, intent.witness);
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
