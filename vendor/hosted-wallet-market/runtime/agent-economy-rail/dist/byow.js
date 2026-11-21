import { verifyMessage, encodeFunctionData, parseAbi } from 'viem';
import { checked, digest, requireThat } from '../../agent-economy-foundation/dist/index.js';
import { prepareIntent, checkChainIdentity } from './local-chain.js';
const abi = parseAbi(['function transfer(address to,uint256 value) returns (bool)']);
/** Owner-local F1 handle. Keys remain inside the supplied account object; sign prepares, the wallet port broadcasts. */
export function localByowHandle(store, client, account, assets) {
    requireThat(assets, 'asset_registry_required');
    return { address: account.address,
        async proveControl(challenge) { const signature = await account.signMessage({ message: challenge }); return verifyMessage({ address: account.address, message: challenge, signature }); },
        signer: { async sign(input) {
                const r = checked('OperationRequest', input), key = JSON.stringify([r.tenantId, r.operationId]), identity = { configuredChain: r.asset.chain, asset: r.asset, assets };
                await checkChainIdentity(client, identity);
                if (r.kind === 'fund') {
                    const bound = store.get('fund-data', key);
                    requireThat(bound && bound.requestDigest === digest(r), 'funding_not_bound');
                    const td = bound.data;
                    for (const field of ['value', 'validAfter', 'validBefore'])
                        td.message[field] = BigInt(td.message[field]);
                    const cap = store.get('capability', JSON.stringify([r.tenantId, r.authorityId]));
                    requireThat(cap && td.message.validBefore * 1000n <= BigInt(Date.parse(cap.expiresAt)), 'funding_signature_expiry');
                    await checkChainIdentity(client, identity);
                    const signature = await account.signTypedData(td);
                    store.put('byow-signature', key, { signature });
                    return { state: 'pending', requestDigest: digest(r), effectRef: `signature:${digest(signature)}` };
                }
                requireThat(r.kind === 'payout', 'wallet_refund_requires_rail');
                const bound = store.get('payout-binding', JSON.stringify([r.tenantId, r.allocationId]));
                requireThat(bound && bound.target === r.target && bound.token === r.asset.token && bound.chain === r.asset.chain && bound.amount === r.amount, 'payout_not_bound');
                const data = encodeFunctionData({ abi, functionName: 'transfer', args: [r.target, BigInt(r.amount)] });
                const intent = await prepareIntent(store, `wallet:${key}`, digest(r), client, account, r.asset.token, data, identity);
                return { state: 'pending', requestDigest: digest(r), effectRef: intent.txId };
            } } };
}
