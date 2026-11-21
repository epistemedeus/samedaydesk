// Strict synthetic stand-in for the H104 operation scope. No last-grant field.
import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash} from 'node:crypto';

const refuse = code => { throw Object.assign(new Error(code), {code, codeName: code, http: 409}); };

export function createOperationAuthorityDouble(grant) {
  const scopes = new AsyncLocalStorage();
  const state = {signatures: 0};
  return {
    get signatures() { return state.signatures; },
    async withOperation({operationId} = {}, callback) {
      if (typeof callback !== 'function' || typeof operationId !== 'string' || operationId.length < 8 || operationId.length > 200) refuse('operation_scope_required');
      if (scopes.getStore()) refuse('operation_scope_reentered');
      return scopes.run(Object.freeze({operationId}), () => callback());
    },
    async readAuthorization({operationId} = {}) {
      const current = scopes.getStore();
      if (!current || current.operationId !== operationId) return null;
      return grant;
    },
    operator: {
      address: grant?.operator,
      async signTransaction(tx) {
        const current = scopes.getStore();
        if (!current) refuse('operation_scope_required');
        if (tx && Object.prototype.hasOwnProperty.call(tx, 'operationId') && tx.operationId !== current.operationId) refuse('operation_scope_mismatch');
        state.signatures += 1;
        return '0x' + createHash('sha256').update(current.operationId + ':' + state.signatures).digest('hex');
      },
    },
  };
}
