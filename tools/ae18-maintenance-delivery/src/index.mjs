import { createOperations } from './core.mjs';
import { assessInputSchema, reviewInputSchema, outputSchema } from './schemas.mjs';
import { digest, requireThat, loadInputs } from './inputs.mjs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
export { loadInputs, createOperations };
export * from './schemas.mjs';

export async function prepareInputs(options) {
  const inputs = await loadInputs(options);
  const { ajv } = await import(pathToFileURL(join(options.gatewayRoot, 'src/schemas.mjs')).href);
  return { ...inputs, gateway: { ...inputs.gateway, registryAjv: ajv } };
}
export function createGatewayRoutes({ store, ...options }) {
  const ops = createOperations({ ...options, readReceipt: (tenant, id) => store.receipt(tenant, id) });
  // Use the accepted store's existing transaction and receipt tables only. No
  // schema/write extension: its ordinary admission precedes these provider reads.
  // The first durable admission owns this finite phase even if a caller changes
  // its idempotency key. A crashed first owner remains uncertain, never rerun.
  function once(phase, operation, tenant) {
    const routeId = `${ops.routePrefix}.${phase}`;
    return async (input, context) => {
      const first = store.transaction(() => store.db.prepare(`SELECT a.id, q.input_digest FROM attempts a
        JOIN quotes q ON q.id=a.quote_id WHERE a.tenant=? AND q.route_id=? ORDER BY a.rowid LIMIT 1`).get(tenant, routeId));
      requireThat(first, 'operation_not_admitted');
      requireThat(first.input_digest === digest(input), 'finite_operation_conflict');
      if (first.id !== context.receiptId) {
        const receipt = store.receipt(tenant, first.id);
        requireThat(receipt.status === 'completed' && receipt.output, 'reconcile_existing_operation');
        return receipt.output;
      }
      return operation(input, context);
    };
  }
  const fixture = phase => ({ schema: 'samedaydesk.maintenance-delivery.v1', phase, binding: ops.binding,
    disposition: 'test_fixture_only', acceptance: 'not_applicable', useful: false, assessment: {}, review: {},
    effects: { paymentAttempts: 0, captures: 0, obligations: 0, paidTaskIncrement: 0, repairExecutions: 0 }, digest: '0'.repeat(64) });
  const definition = (suffix, schema, run, phase) => ({ id: `${ops.routePrefix}.${suffix}`, version: '1', provider: 'sds-finite-maintenance',
    description: 'One owner-bound changed-source assessment or authorized finite review. No repair or payment execution.',
    price: { amount: 0, unit: 'usd-micros' }, timeoutMs: 15000, maxOutputBytes: 262144,
    inputSchema: schema, outputSchema, run, test: () => fixture(phase) });
  return { operations: ops, routes: [definition('assess', assessInputSchema, once('assess', ops.assess, options.ownerTenant), 'assessment'),
    definition('review', reviewInputSchema, once('review', ops.review, options.reviewTenant), 'handback')] };
}
export function assertRouteScopes(tenants, operations, ownerTenant, reviewTenant) {
  const assess = `${operations.routePrefix}.assess`, review = `${operations.routePrefix}.review`;
  requireThat(tenants.some(t => t.id === ownerTenant && t.routes.includes(assess)), 'owner_scope_required');
  requireThat(tenants.some(t => t.id === reviewTenant && t.routes.includes(review)), 'review_scope_required');
  for (const t of tenants) {
    requireThat(!t.routes.includes(assess) || t.id === ownerTenant, 'foreign_assessment_scope');
    requireThat(!t.routes.includes(review) || t.id === reviewTenant, 'foreign_review_scope');
  }
}
export function createReadOnlyCheck(options) {
  const operations = createOperations(options);
  return async ({ signal } = {}) => {
    const output = await operations.assess({ descriptorDigest: operations.binding.descriptorDigest }, { signal });
    return { schema: 'samedaydesk.maintenance-check.v1', binding: output.binding,
      due: output.disposition === 'bounded_assessment', disposition: output.disposition,
      assessment: output, execute: false, schedulesCreated: 0 };
  };
}
