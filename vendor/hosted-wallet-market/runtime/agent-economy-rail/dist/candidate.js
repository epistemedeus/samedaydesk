import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { digest, immutable, requireThat } from '../../agent-economy-foundation/dist/index.js';
import { keccak256, parseAbi } from 'viem';
export const VERSIONED_CANDIDATE = 'v1.1.0-b748fdd';
export const VERSIONED_SOURCE = '6b0a5ef3f0df973857f558e2d6b5dd645b5e97f9';
export const VERSIONED_DECLARATION = 'b748fdd7a830a655a19a530edcf2a94b9dc7d25f';
export const VERSIONED_ESCROW = '0xf96815976523e00e65be8f34ca5e64b4f41eb19c';
export const ASSET_IMPLEMENTATION_SLOT = '0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3';
const abi = () => JSON.parse(readFileSync(new URL('../../agent-economy-foundation/interfaces/commerce-payments-v1.1.0.abi.json', import.meta.url), 'utf8'));
const json = (name) => JSON.parse(readFileSync(new URL(`../fixtures/versioned/${name}`, import.meta.url), 'utf8'));
const lower = (v) => v.toLowerCase();
/** These immutable exports are received source inputs, never a grant or a funded journal. */
export function loadVersionedCandidate(chain) {
    requireThat(['eip155:8453', 'eip155:84532'].includes(chain), 'candidate_network');
    const id = chain.slice(7);
    return { receipt: json(`admission.${id}.json`), runtime: json(`runtime.${id}.json`), bytecode: json('bytecode.json') };
}
export function qualifyCandidate(receipt, runtime, bytecode) {
    const chain = receipt?.subject?.network, canonical = loadVersionedCandidate(chain);
    // The producer's fixed subject and compiler evidence are consumed exactly.
    // Refresh goes through attestCandidate, not by editing a historical receipt.
    requireThat(digest(receipt) === digest(canonical.receipt) && digest(runtime) === digest(canonical.runtime) && digest(bytecode) === digest(canonical.bytecode), 'candidate_packet_changed');
    requireThat(receipt.schema === 'ae14.network-admission.v1' && receipt.verdict === 'admitted' && receipt.reasons.length === 0 && receipt.missing.length === 0, 'candidate_refused');
    requireThat(runtime.schema === 'ae14.runtime-profile.v1' && runtime.network === chain && runtime.selectedRelease.commit === VERSIONED_SOURCE && runtime.selectedRelease.abiUsedForDeployedEscrow === true && runtime.selectedRelease.verdict === 'qualified', 'candidate_release');
    const releaseAbi = abi(), exportedAbiDigest = createHash('sha256').update(JSON.stringify(releaseAbi)).digest('hex');
    requireThat(runtime.deployedEscrow.abiDigest === exportedAbiDigest && runtime.deployedEscrow.address.toLowerCase() === VERSIONED_ESCROW && runtime.deploymentDeclarationRef.commit === VERSIONED_DECLARATION && runtime.deployedEscrow.feeSemantics.argument === 'feeAmount', 'candidate_abi');
    const asset = bytecode.contracts.assetImplementation, subject = asset.subjects.find((s) => s.chainId === runtime.chainId), linked = subject?.linkedRuntime?.[0];
    requireThat(asset.status === 'match' && asset.sourceCommit === '405efc100c016ed1a437063b6274b4e24ea7b8b1' && asset.librariesCompared === true && asset.libraries.length === 1 && subject.linkedRuntime.length === 1 && linked.bodyEqual === true && linked.guard?.matchesAccount === true && linked.guard.start === 1 && linked.guard.length === 20 && linked.guard.derivedFrom === 'solc-0.6-external-library-guard', 'candidate_asset');
    const collectors = runtime.collectors.filter((c) => c.loadBearing), collector = collectors.find((c) => c.name === 'ERC3009PaymentCollector'), refund = collectors.find((c) => c.name === 'OperatorRefundCollector');
    requireThat(collectors.length === 2 && collector.status === 'qualified' && refund.status === 'qualified' && runtime.tokenStore.status === 'qualified', 'candidate_collectors');
    const codeHashes = {};
    for (const part of [runtime.deployedEscrow, collector, refund, runtime.tokenStore, runtime.asset.proxy, runtime.asset.implementation]) {
        requireThat(/^0x[0-9a-f]{64}$/.test(part.observedCodeHash), 'candidate_code');
        codeHashes[lower(part.address)] = part.observedCodeHash;
    }
    codeHashes[lower(linked.address)] = linked.observedCodeHash;
    const identity = { schema: 'ae14.financial-source.v1', candidateId: VERSIONED_CANDIDATE, chain, chainId: runtime.chainId, source: VERSIONED_SOURCE, declaration: VERSIONED_DECLARATION,
        abiDigest: digest(Object.fromEntries(releaseAbi.map((e) => [`${e.type}:${e.name}`, e]))), exportedAbiDigest, escrow: VERSIONED_ESCROW,
        collector: lower(collector.address), refundCollector: lower(refund.address), token: lower(runtime.asset.proxy.address), tokenStore: lower(runtime.tokenStore.address),
        implementation: lower(subject.address), implementationSlot: ASSET_IMPLEMENTATION_SLOT, library: lower(linked.address), codeHashes };
    const candidate = { ...identity, identityDigest: digest(identity), remainingUnknowns: [...runtime.remainingUnknowns] };
    return immutable({ schema: 'ae14.network-profile.v1', class: 'public', status: 'qualified', qualifiesPublic: true, signerAuthority: false,
        abiForDeployedAddress: exportedAbiDigest, candidate, remainingUnknowns: candidate.remainingUnknowns,
        assetDecision: { executableBody: 'equal', linkedLibrary: 'equal_with_validated_self_address_guard', metadata: 'unknown', usableFor: 'runtime_identity_only' },
        reasons: [], missing: [], pendingJoin: [] });
}
export function versionedSource(chain) { const p = loadVersionedCandidate(chain); return qualifyCandidate(p.receipt, p.runtime, p.bytecode).candidate; }
/** A refreshable read binds actual code, proxy target, collectors and finalized block. */
export async function attestCandidate(client, candidate, now = Date.now(), maxAgeSeconds = 3600, executionClass = 'public') {
    requireThat(digest(candidate) === digest(versionedSource(candidate.chain)), 'candidate_identity_changed');
    requireThat(await client.getChainId() === candidate.chainId, 'chain_identity_mismatch');
    const block = await client.getBlock({ blockTag: 'finalized' });
    requireThat(block?.hash && block.number !== null && Number.isSafeInteger(Number(block.timestamp)) && (executionClass === 'owned-fork' || (Number(block.timestamp) * 1000 <= now + 30000 && now - Number(block.timestamp) * 1000 <= maxAgeSeconds * 1000)), 'attestation_stale');
    for (const [address, hash] of Object.entries(candidate.codeHashes)) {
        const code = await client.getCode({ address, blockNumber: block.number });
        requireThat(code && keccak256(code) === hash, 'candidate_code_changed');
    }
    const slot = await client.getStorageAt({ address: candidate.token, slot: candidate.implementationSlot, blockNumber: block.number });
    requireThat(slot?.toLowerCase() === '0x' + '0'.repeat(24) + candidate.implementation.slice(2), 'asset_implementation_changed');
    const callAbi = parseAbi(['function authCaptureEscrow() view returns (address)', 'function collectorType() view returns (uint8)', 'function tokenStoreImplementation() view returns (address)']);
    for (const [address, type] of [[candidate.collector, 0], [candidate.refundCollector, 1]]) {
        requireThat(lower(await client.readContract({ address, abi: callAbi, functionName: 'authCaptureEscrow', blockNumber: block.number })) === candidate.escrow, 'candidate_collector_changed');
        requireThat(Number(await client.readContract({ address, abi: callAbi, functionName: 'collectorType', blockNumber: block.number })) === type, 'candidate_collector_changed');
    }
    requireThat(lower(await client.readContract({ address: candidate.escrow, abi: callAbi, functionName: 'tokenStoreImplementation', blockNumber: block.number })) === candidate.tokenStore, 'candidate_token_store_changed');
    const repeat = await client.getBlock({ blockNumber: block.number });
    requireThat(repeat.hash === block.hash, 'candidate_block_changed');
    const body = { blockNumber: String(block.number), blockHash: block.hash, time: String(block.timestamp), freshness: 'fresh', status: 'qualified',
        provenance: `${VERSIONED_CANDIDATE}:${candidate.identityDigest}`, rpcEndpoint: client.transport.url, reasons: [] };
    return { ...body, ref: digest(body) };
}
/** Observe current execution and OP Stack costs; source admission supplies no gas budget. */
export async function candidateFeeQuote(client, limits, data, networkClass) {
    const block = await client.getBlock(), suggestedPriority = await client.estimateMaxPriorityFeePerGas();
    let operatorFeeAtGasLimit = 0n, l1FeeUpperBound = 0n;
    if (networkClass === 'public') {
        const address = '0x420000000000000000000000000000000000000F';
        const feeAbi = parseAbi(['function getOperatorFee(uint256) view returns (uint256)', 'function getL1FeeUpperBound(uint256) view returns (uint256)']);
        operatorFeeAtGasLimit = await client.readContract({ address, abi: feeAbi, functionName: 'getOperatorFee', args: [limits.gasLimit], blockNumber: block.number });
        l1FeeUpperBound = await client.readContract({ address, abi: feeAbi, functionName: 'getL1FeeUpperBound', args: [BigInt((data.length - 2) / 2 + 512)], blockNumber: block.number });
    }
    requireThat(typeof block.baseFeePerGas === 'bigint', 'fee_estimate_unknown');
    return { baseFee: block.baseFeePerGas, suggestedPriority, operatorFormula: networkClass === 'public' ? 'unknown' : 'pre-isthmus', operatorFeeScalar: null, operatorFeeConstant: null,
        operatorFeeAtGasLimit, l1Fee: null, l1FeeUpperBound, source: client.transport.url, block: { number: String(block.number), hash: block.hash }, upgrade: networkClass === 'public' ? 'observed-predeploy-formula-not-inferred' : 'disposable-evm-no-op-stack-fees' };
}
