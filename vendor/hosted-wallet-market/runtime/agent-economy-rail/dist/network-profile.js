import { readFileSync } from 'node:fs';
import { digest, immutable, requireThat, BoundaryError } from '../../agent-economy-foundation/dist/index.js';
import { qualifyCandidate } from './candidate.js';
export const DEPLOYED_PUBLIC_ESCROW = '0xbdea0d1bcc5966192b070fdf62ab4ef5b4420cff';
export const PARENT_RUNTIME_VERSION = 'parent-98b592b8';
export const PARENT_ABI_DIGEST = '96b14602568973ece900933659479073e3889be813797a184ad70da91313d2e7';
export const PARENT_SOURCE_COMMIT = '98b592b83870b8b7facca54f76356f4d1f518522';
export const SELECTED_RELEASE = 'commerce-payments@v1.1.0+6b0a5ef3f0df973857f558e2d6b5dd645b5e97f9';
/** N3 profile 12cd27d4. Receipt bytes match the superseded 76f4ad3d label; only the citation changed. */
export const N3_EXPORT = {
    commit: '12cd27d43ea74b1bd9fc1bbf644a0e7494aaad8e',
    tree: '57d2955b2f6f2f5137be9039bbfafd61a3e853b7',
    receipts: {
        'eip155:8453': '2835e71d3596cacbd3cf8852d7c73c87d172562221491635fa59ced936d39738',
        'eip155:84532': '55bf5389027b253134d7c263194e952c2cc2582233ac650887b318477ca64eeb',
    },
};
const abiIndex = (abi) => Object.fromEntries(abi.map(entry => [`${entry.type}:${entry.name}`, entry]));
let selectedDigest = null;
/** Digest of the sandbox selected build. It is a refusal key for the deployed public escrow, not that address's ABI. */
export function selectedReleaseAbiDigest() {
    if (selectedDigest)
        return selectedDigest;
    const abi = JSON.parse(readFileSync(new URL('../../agent-economy-foundation/interfaces/commerce-payments-v1.1.0.abi.json', import.meta.url), 'utf8'));
    selectedDigest = digest(abiIndex(abi));
    return selectedDigest;
}
export function eip155ChainId(chain) {
    requireThat(/^eip155:[1-9][0-9]*$/.test(chain), 'chain_identity_unknown');
    return Number(chain.slice('eip155:'.length));
}
export function nonceAuthorityKey(chainId, account, forkId) {
    const id = String(chainId).replace(/^eip155:/, '');
    const acct = account.toLowerCase();
    requireThat(/^[1-9][0-9]*$/.test(id), 'chain_identity_unknown');
    requireThat(/^0x[0-9a-f]{40}$/.test(acct), 'signer_account');
    if (forkId !== undefined) {
        requireThat(/^[A-Za-z0-9._-]{1,64}$/.test(forkId), 'fork_id');
        return `fork:${forkId}:${id}:${acct}`;
    }
    return `${id}:${acct}`;
}
const normParty = (party) => ({ address: party.address.toLowerCase(), codeHash: party.codeHash.toLowerCase() });
/** Stable identity. Attestation, endpoint, block and time are not inputs. */
export function identityDigestOf(identity) {
    return digest({
        chainId: identity.chainId,
        networkClass: identity.networkClass,
        forkId: identity.networkClass === 'owned-fork' ? identity.forkId ?? null : null,
        escrow: normParty(identity.escrow),
        collector: normParty(identity.collector),
        token: normParty(identity.token),
        release: identity.release,
        signerAccount: identity.signerAccount.toLowerCase(),
        contractVersionId: identity.contractVersionId,
        abiDigest: identity.abiDigest,
    });
}
export function assertSigningAttestation(attestation) {
    if (!attestation || attestation.freshness !== 'fresh' || attestation.status !== 'qualified')
        throw new BoundaryError('attestation_stale');
}
/** Admission, including a refused N3 receipt, is not signer authority. */
export function admissionGrantsSigner(_receipt) { return false; }
export function loadVendoredReceipt(chain) {
    const file = chain === 'eip155:8453' ? 'n3-eip155-8453.json' : 'n3-eip155-84532.json';
    return JSON.parse(readFileSync(new URL(`../fixtures/${file}`, import.meta.url), 'utf8'));
}
/** Public profile from an N3 receipt. Refused stays refused and keeps the receipt's reasons. */
export function qualifyPublic(receipt, runtime, bytecode) {
    if (runtime !== undefined || bytecode !== undefined)
        return qualifyCandidate(receipt, runtime, bytecode);
    requireThat(receipt?.schema === 'ae14.network-admission.v1', 'admission_schema');
    requireThat(Array.isArray(receipt.reasons), 'admission_schema');
    const reasons = [...receipt.reasons];
    const refused = receipt.verdict === 'refused';
    return immutable({
        schema: 'ae14.network-profile.v1',
        class: 'public',
        status: refused ? 'refused' : 'not-qualified',
        verdict: receipt.verdict ?? null,
        reasons,
        missing: Array.isArray(receipt.missing) ? [...receipt.missing] : [],
        qualifiesPublic: false,
        signerAuthority: false,
        abiForDeployedAddress: null,
        pendingJoin: ['H'],
    });
}
export function publicProfile() {
    const mainnet = qualifyPublic(loadVendoredReceipt('eip155:8453'));
    const sepolia = qualifyPublic(loadVendoredReceipt('eip155:84532'));
    return immutable({ ...mainnet, chains: { 'eip155:8453': mainnet, 'eip155:84532': sepolia }, source: N3_EXPORT });
}
export function splitAdmission(receipt) {
    const profile = qualifyPublic(receipt);
    const block = receipt.observation?.block ?? receipt.subject?.block;
    return {
        identity: null,
        identityDigest: null,
        attestation: {
            ref: digest({ verdict: receipt.verdict ?? null, reasons: profile.reasons, block: block ?? null }),
            blockNumber: block?.number ?? null,
            blockHash: block?.hash ?? null,
            time: block && 'timestamp' in block && block.timestamp !== undefined ? String(block.timestamp) : null,
            freshness: 'refused',
            status: profile.status === 'refused' ? 'refused' : 'unknown',
            provenance: String(receipt.schema),
            rpcEndpoint: receipt.observation?.route ?? null,
            reasons: profile.reasons,
        },
        grantsReset: false,
        spendReset: false,
        signerAuthority: false,
    };
}
/** Explicit version handle. The selected 1.1.0 ABI is refused for the deployed escrow and is not returned. */
export function bindVersionedContract(spec) {
    requireThat(typeof spec.versionId === 'string' && spec.versionId.length > 0, 'contract_version_required');
    requireThat(/^0x[0-9a-fA-F]{40}$/.test(spec.address), 'contract_address');
    requireThat(/^[0-9a-f]{64}$/.test(spec.abiDigest), 'abi_digest');
    if (spec.abi !== undefined)
        requireThat(digest(abiIndex(spec.abi)) === spec.abiDigest, 'abi_digest_mismatch');
    const address = spec.address.toLowerCase();
    if (address === DEPLOYED_PUBLIC_ESCROW && spec.abiDigest === selectedReleaseAbiDigest())
        throw new BoundaryError('selected_abi_refused');
    return immutable({ versionId: spec.versionId, abiDigest: spec.abiDigest, address, abi: null, qualifiesPublic: false, signerAuthority: false });
}
export function parentRuntimeContract(address = DEPLOYED_PUBLIC_ESCROW) {
    return bindVersionedContract({ versionId: PARENT_RUNTIME_VERSION, abiDigest: PARENT_ABI_DIGEST, address });
}
export function qualifyLocal(identity, attestation, extras = {}) {
    requireThat(identity.networkClass !== 'public', 'attestation_stale');
    if (identity.networkClass === 'sandbox')
        requireThat(identity.chainId === 31337, 'chain_identity_mismatch');
    if (identity.networkClass === 'owned-fork')
        requireThat(!!identity.forkId, 'fork_id');
    assertSigningAttestation(attestation);
    const identityDigest = identityDigestOf(identity);
    return { status: 'qualified', signerAuthority: false, identity, identityDigest, attestation, ...extras };
}
export function freshAttestation(input) {
    const body = { blockNumber: input.blockNumber, blockHash: input.blockHash, time: input.time, freshness: 'fresh', status: 'qualified', provenance: input.provenance, rpcEndpoint: input.rpcEndpoint, reasons: input.reasons ?? [] };
    return { ...body, ref: digest(body) };
}
/** A new attestation over an unchanged identity. The caller must not rewrite grants or nonce rows. */
export function refreshAttestation(identity, previousDigest, attestation) {
    const identityDigest = identityDigestOf(identity);
    requireThat(identityDigest === previousDigest, 'identity_changed');
    return { identityDigest, attestation, grantsReset: false, spendReset: false };
}
export function requalifyIdentity(store, input) {
    const previousDigest = identityDigestOf(input.previous);
    const nextDigest = identityDigestOf(input.next);
    const nonceKey = nonceAuthorityKey(input.previous.chainId, input.previous.signerAccount, input.previous.networkClass === 'owned-fork' ? input.previous.forkId : undefined);
    const before = store.get('nonce', nonceKey);
    if (previousDigest !== nextDigest)
        requireThat(input.explicit === true, 'identity_changed');
    if (previousDigest !== nextDigest)
        store.put('requalification', nextDigest, { explicit: true, previousDigest });
    requireThat(digest(store.get('nonce', nonceKey)) === digest(before), 'nonce_reset');
    return { identityDigest: nextDigest, nonceKey, nonce: store.get('nonce', nonceKey) };
}
/** A fork receipt cannot close a reservation in another journal, even when the chain id matches. */
export function resolveReservation(store, receipt) {
    if (receipt.namespace === 'fork')
        requireThat(store.namespace.kind === 'fork' && store.namespace.forkId === receipt.forkId, 'fork_receipt_isolated');
    else
        requireThat(store.namespace.kind === 'chain', 'fork_receipt_isolated');
    const key = nonceAuthorityKey(receipt.chainId, receipt.account, receipt.namespace === 'fork' ? receipt.forkId : undefined);
    const row = store.get('nonce', key);
    requireThat(row, 'reservation_absent');
    return { key, next: row.next, txId: receipt.txId };
}
