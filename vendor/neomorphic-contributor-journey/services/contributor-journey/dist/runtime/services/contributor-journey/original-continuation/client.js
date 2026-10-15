import { hashTermsVersion } from '../../earned-work/src/terms-version.js';
import { canonicalSchema, ContinuationError } from './types.js';
async function boundedBody(response) {
    const reader = response.body?.getReader();
    if (!reader)
        return Buffer.alloc(0);
    const chunks = [];
    let size = 0;
    try {
        for (;;) {
            const chunk = await reader.read();
            if (chunk.done)
                break;
            size += chunk.value.byteLength;
            if (size > 65536) {
                await reader.cancel();
                throw new ContinuationError('unavailable', 503);
            }
            chunks.push(chunk.value);
        }
        return Buffer.concat(chunks);
    }
    finally {
        reader.releaseLock();
    }
}
export function canonicalOrigin(input) {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.origin !== input || url.username || url.password)
        throw new ContinuationError('invalid_input', 400);
    return url.origin;
}
export function validateCanonical(value, source, claimId, operationKey) {
    const checked = canonicalSchema.safeParse(value);
    if (!checked.success)
        throw new ContinuationError('unavailable', 503);
    const row = checked.data;
    if (row.roundKey !== source.roundKey || row.provenance !== source.provenance || row.claimId !== claimId || row.claim.id !== claimId ||
        row.terms.roundKey !== source.roundKey || hashTermsVersion(row.terms) !== row.claim.termsVersion ||
        (row.submission && (row.submission.claimId !== claimId || row.submission.termsVersion !== row.claim.termsVersion)) ||
        (row.obligation && (row.obligation.claimId !== claimId || row.obligation.termsVersion !== row.claim.termsVersion)) ||
        (row.operation && row.operation.key !== operationKey))
        throw new ContinuationError('conflict', 409);
    return row;
}
/** Exactly one HTTPS attempt per call; no redirects, credential persistence or submit retry. */
export function createOriginalRouteClient(options) {
    const origin = canonicalOrigin(options.origin);
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(options.roundKey) || !['test', 'fixture', 'production'].includes(options.provenance))
        throw new ContinuationError('invalid_input', 400);
    const request = options.request ?? fetch;
    const base = (claimId) => {
        if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(claimId))
            throw new ContinuationError('invalid_input', 400);
        return `${origin}/api/neomorphic-opportunity/v1/opportunity-rounds/${options.roundKey}/claims/${claimId}/continuation`;
    };
    const headers = (credential) => {
        if (!/^[A-Za-z0-9_-]{24,512}$/.test(credential))
            throw new ContinuationError('unauthorized', 401);
        return { authorization: `Bearer ${credential}` };
    };
    return { origin, roundKey: options.roundKey, provenance: options.provenance,
        async read(claimId, credential, operationKey) {
            const url = new URL(base(claimId));
            url.searchParams.set('provenance', options.provenance);
            if (operationKey)
                url.searchParams.set('operationKey', operationKey);
            const response = await request(url, { headers: headers(credential), redirect: 'error', signal: AbortSignal.timeout(5000) });
            if (!response.ok)
                throw new ContinuationError(response.status === 401 ? 'unauthorized' : response.status === 403 ? 'forbidden' : response.status === 404 ? 'not_found' : 'unavailable', response.status < 500 && [401, 403, 404].includes(response.status) ? response.status : 503);
            const bytes = await boundedBody(response);
            return validateCanonical(JSON.parse(bytes.toString('utf8')), options, claimId, operationKey);
        },
        async submit(claimId, credential, body, key) {
            const response = await request(base(claimId) + '/submissions', { method: 'POST', headers: { ...headers(credential), 'content-type': 'application/json', 'idempotency-key': key },
                body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(5000) });
            // A broken acknowledgement body is also unknown. No upstream body is returned to the desk.
            await boundedBody(response);
            return { status: response.status };
        } };
}
//# sourceMappingURL=client.js.map