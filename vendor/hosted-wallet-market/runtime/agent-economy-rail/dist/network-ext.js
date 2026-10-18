import { requireThat } from '../../agent-economy-foundation/dist/index.js';
export const NETWORK_EXT_SCHEMA = 'ae14.rail-network-ext.v1';
export function capabilityExtension(input) {
    requireThat(input.capabilityId.length > 0 && input.identityDigest.length === 64, 'network_ext');
    requireThat(/^[0-9]+$/.test(input.nativeBudget), 'native_budget');
    return { schema: NETWORK_EXT_SCHEMA, ...input, nativeSpent: '0' };
}
export function readExtension(store, tenantId, capabilityId) {
    const row = store.get('network-ext', JSON.stringify([tenantId, capabilityId]));
    if (!row)
        return null;
    requireThat(row.schema === NETWORK_EXT_SCHEMA, 'network_ext');
    return row;
}
export function joinOperation(store, tenantId, operationId, ext) {
    const row = { ...ext, operationId };
    store.put('network-ext', JSON.stringify([tenantId, 'operation', operationId]), row);
    return row;
}
