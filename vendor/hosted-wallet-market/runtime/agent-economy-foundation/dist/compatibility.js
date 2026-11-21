import { checked, requireThat } from './contracts.js';
export function inspectExistingMandate(evaluate, packet) {
    const result = evaluate(packet), a = result.authority;
    return { kind: 'existing_paid_http_purchase', requesterId: a.requesterId, taskId: a.taskId, principalId: a.principal,
        recipient: a.recipient, amount: a.amountAtomic, chain: a.network, token: a.asset, expiresAt: a.expiresAt,
        grantsFunding: false, grantsSettlement: false, grantsWalletSigner: false };
}
/** Reuse the existing closed text envelope decoder. Binding comes from the controller, independently. */
export function bindExistingTaskText(decode, publicText, binding) {
    requireThat(decode(publicText).type === 'task', 'unrecognized_existing_task');
    return checked('Task', { ...binding, publicText });
}
