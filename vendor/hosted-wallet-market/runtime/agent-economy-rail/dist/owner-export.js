import { digest, requireThat, BoundaryError } from '../../agent-economy-foundation/dist/index.js';
const SECRET_KEY = /^(privatekey|private_key|seed|mnemonic|unlock|unlockkey|cipher|ciphertext|keystore|password|secret)$/i;
function rejectSecrets(value, path = 'export') {
    if (Array.isArray(value)) {
        value.forEach((item, i) => rejectSecrets(item, `${path}[${i}]`));
        return;
    }
    if (!value || typeof value !== 'object')
        return;
    for (const [key, child] of Object.entries(value)) {
        if (SECRET_KEY.test(key))
            throw new BoundaryError('secret_export_refused');
        rejectSecrets(child, `${path}.${key}`);
    }
}
/** Intent, observation or recovery for the owner. Secret material is refused, not redacted into the document. */
export function exportOwnerRecord(kind, input) {
    rejectSecrets(input);
    const body = {
        schema: 'ae14.owner-export.v1',
        kind,
        call: input.call ?? null,
        amount: input.amount ?? null,
        destination: input.destination ?? null,
        identityDigest: input.identityDigest ?? null,
        feeLimits: input.feeLimits ?? null,
        estimates: input.estimates ?? null,
        observation: kind === 'observation' ? (input.observation ?? null) : null,
        recovery: kind === 'recovery' ? (input.recovery ?? null) : null,
        pendingJoin: ['H'],
    };
    rejectSecrets(body);
    requireThat(!JSON.stringify(body).includes('privateKey'), 'secret_export_refused');
    return body;
}
export function exportDigest(record) {
    return digest(record);
}
