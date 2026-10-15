import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { digest, readJson, requireThat, canonical } from './inputs.mjs';
import { descriptorSchema, rightsSchema } from './schemas.mjs';

export function createOperations({ inputs, descriptorPath, rightsPath, priorPath, ownerTenant, reviewTenant, now = Date.now,
  mountedOrigin = null, readReceipt }) {
  // Gateway providers receive receiptId and signal, not tenant. Mount policy binds
  // these two routes to distinct deployment-owned tenant scopes.
  const ajv = inputs.gateway.registryAjv; // Validation is supplied by the mounted runtime below.
  requireThat(typeof ajv?.compile === 'function', 'runtime_validator_required');
  const checkDescriptor = ajv.compile(descriptorSchema), checkRights = ajv.compile(rightsSchema);
  const initial = readJson(descriptorPath);
  requireThat(checkDescriptor(initial), 'invalid_descriptor');
  requireThat(initial.taskId !== initial.distinctTaskId && initial.owner === initial.source.owner && initial.retained.sourceId === initial.source.id && initial.retained.taskId === initial.distinctTaskId, 'descriptor_identity_mismatch');
  requireThat(Number.isFinite(Date.parse(initial.expiry)), 'invalid_expiry');
  requireThat(ownerTenant !== reviewTenant, 'distinct_review_authority_required');
  const descriptorDigest = digest(initial);
  const binding = { occurrenceId: initial.occurrenceId, taskId: initial.taskId, sourceId: initial.source.id,
    sourceDigest: initial.source.expectedDigest, descriptorDigest };
  const rights = () => {
    const value = readJson(rightsPath);
    requireThat(checkRights(value) && Number.isFinite(Date.parse(value.validUntil)), 'invalid_rights');
    requireThat(value.owner === initial.owner && value.sourceId === binding.sourceId && value.taskId === binding.taskId, 'foreign_rights');
    return value;
  };
  const currentDescriptor = () => requireThat(digest(readJson(descriptorPath)) === descriptorDigest, 'descriptor_changed');
  function prior() {
    const value = readJson(priorPath);
    requireThat(value.immutable === true && value.recipeId === 'source-change-alert', 'immutable_recipe_prior_required');
    requireThat(value.taskId === initial.retained.taskId && value.sourceId === binding.sourceId, 'foreign_prior');
    requireThat(digest(value.payload) === value.sha256 && value.sha256 === initial.priorDigest && value.sha256 === initial.retained.payloadDigest, 'prior_digest_mismatch');
    requireThat(value.sequence < initial.sequence && Number.isFinite(Date.parse(value.createdAt)) && Date.parse(value.createdAt) <= now(), 'invalid_prior_version');
    return value;
  }
  const blocked = value => [
    ...(!value.reuseAllowed || !initial.retained.entitled ? ['retained_reuse_not_entitled'] : []),
    ...(!['mit', 'owner_qa'].includes(value.licensePlane) ? ['license_plane'] : []),
    ...(value.mandateState === 'revoked' ? ['revoked_mandate'] : []),
    ...(Date.parse(value.validUntil) <= now() ? ['rights_expired'] : []),
  ];
  const finish = (phase, disposition, acceptance, assessment = {}, review = {}, useful = false) => {
    const output = { schema: 'samedaydesk.maintenance-delivery.v1', phase, binding, disposition, acceptance, useful, assessment, review,
      effects: { paymentAttempts: 0, captures: 0, obligations: 0, paidTaskIncrement: 0, repairExecutions: 0 } };
    return { ...output, digest: digest(output) };
  };
  async function assess(input, { signal = AbortSignal.timeout(10000) } = {}) {
    requireThat(input.descriptorDigest === descriptorDigest, 'foreign_descriptor'); currentDescriptor();
    const r = rights(), clock = new Date(now()).toISOString();
    const rightsBlocks = [...blocked(r), ...(!r.readAllowed ? ['read_rights_revoked'] : [])];
    if (rightsBlocks.length) return finish('assessment', 'useful_no_fit', 'approval_pending', {
      reasons: rightsBlocks, rightsRevision: r.revision, sourceRequests: 0,
      observation: 'not_read_or_reused_under_current_rights', repairOutput: 'not_supplied_by_E02',
      workAcceptedAs: 'current rights and applicability no-fit assessment only' }, {}, true);
    const p = prior();
    if ((now() - Date.parse(p.createdAt)) / 3600000 > initial.horizonHours) {
      // Execute the existing stale-baseline path without fetching current content.
      const observed = await inputs.recipe.runSourceChangeAlert({ priorPath, clock, fields: initial.fields, horizonHours: initial.horizonHours });
      return finish('assessment', 'stale_baseline', 'not_applicable', { recipe: observed, repairOutput: 'not_supplied_by_E02' });
    }
    const url = new URL(initial.source.url);
    requireThat(!url.username && !url.password && !url.hash && !url.search, 'source_url_refused');
    // This integration deliberately supports one exact configured loopback origin.
    // Public acquisition needs an owning DNS-pinned transport join, not arbitrary fetch.
    requireThat(mountedOrigin && url.origin === mountedOrigin && url.hostname === '127.0.0.1' && url.protocol === 'http:', 'source_mount_required');
    signal.throwIfAborted();
    const response = await fetch(url, { method: 'GET', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
      headers: { accept: 'application/json' } });
    requireThat(response.status === 200 && /^application\/json\b/.test(response.headers.get('content-type') || ''), 'source_unavailable');
    let bytes = 0; const chunks = [];
    for await (const chunk of response.body) {
      bytes += chunk.length; requireThat(bytes <= 65536, 'source_limit'); chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks), sourceDigest = digest(raw);
    requireThat(sourceDigest === binding.sourceDigest, 'source_version_changed');
    const current = JSON.parse(raw);
    requireThat(current && typeof current.fields === 'object' && !Array.isArray(current.fields), 'source_fields_required');
    const missing = initial.fields.filter(field => typeof current.fields[field] !== 'string' || !current.fields[field]);
    const dir = mkdtempSync(join(tmpdir(), 'ae18-observe-'));
    try {
      const currentPath = join(dir, 'current.json'); writeFileSync(currentPath, raw, { mode: 0o600 });
      const request = { schema: 'samedaydesk.compat-maintenance-request.v1', occurrenceId: binding.occurrenceId, taskId: binding.taskId,
        distinctTaskId: initial.distinctTaskId, subject: initial.subject, sequence: initial.sequence, clock, expiry: initial.expiry,
        priorPath, currentFixturePath: currentPath, fields: initial.fields, tenant: ownerTenant, authorityTenant: ownerTenant,
        horizonHours: initial.horizonHours, applicability: { sourceChanged: true, licensePlane: r.licensePlane,
          accessWithdrawn: false, rightsCleared: r.reuseAllowed, applicabilityMiss: blocked(r).length > 0, inheritFull: false },
        procurement: { mandateState: r.mandateState, coldProfile: 'finite-reader', incumbentProfile: 'retained-owner',
          actorPid: 222, incumbentPid: 111, actorIsMandatePrincipal: false, priorSpend: paymentUnknown(p) ? 'outcome_unknown' : 'none',
          reusableOutput: initial.retained.entitled && r.reuseAllowed, inheritedAuthorityRequested: false },
        economics: { termsVersion: 'new-market', grossAtoms: '20', operation: 'quote', feeMode: 'per-capture',
          observedEffort: 'unknown', reviewBurden: 'unknown', modeledCost: 'unknown', cashCost: 'unknown', tokenPriceRecommendation: null },
        review: { reviewer: null, decision: null }, optIn: initial.optIn };
      // Actual recipe and template, no injected final outcome. Capture the recipe
      // execution so the merchant comparison and projection describe the same bytes.
      let recipe;
      const template = await inputs.template.runMaintenanceOccurrence(request, { detect: async args => {
        recipe = await inputs.recipe.runSourceChangeAlert(args); return recipe;
      } });
      requireThat(template.ok && recipe, 'template_observation_failed');
      const beforePath = join(dir, 'before-batch.json'), afterPath = join(dir, 'after-batch.json');
      writeFileSync(beforePath, JSON.stringify(batch(p.payload.fields, binding.sourceId, initial.source.url)));
      writeFileSync(afterPath, JSON.stringify(batch(current.fields, binding.sourceId, initial.source.url)));
      const merchant = await inputs.merchant.comparePageChangeArtifacts({ beforePath, afterPath, fields: initial.fields, clock });
      const reasons = blocked(r);
      let disposition = recipe.outcome === 'unchanged' ? 'not_yet_due' : reasons.length ? 'useful_no_fit' : 'bounded_assessment';
      if (missing.length || !merchant.report.claims.complete) disposition = 'partial_fields';
      if (paymentUnknown(p)) disposition = 'reconciliation_required';
      const useful = ['bounded_assessment', 'useful_no_fit', 'reconciliation_required'].includes(disposition);
      const acceptance = disposition === 'not_yet_due' || disposition === 'partial_fields' ? 'not_applicable' : 'approval_pending';
      // Existing projection retains incomplete fields; schema validity is never
      // promoted to public safety or new entitlement.
      const reuse = initial.optIn ? inputs.reuse.exportReuse(merchant.report, { taskId: binding.taskId, subject: initial.subject,
        sequence: initial.sequence, clock, optIn: true }) : inputs.reuse.previewReuse(merchant.report, {
        taskId: binding.taskId, subject: initial.subject, sequence: initial.sequence, clock });
      requireThat(reuse.ok, 'projection_failed');
      return finish('assessment', disposition, acceptance, { clock, sourceBytes: bytes, sourceRequests: 1,
        selected: current.fields, missing, reasons, rightsRevision: r.revision, template,
        templateRequest: { ...request, priorPath: 'immutable-prior', currentFixturePath: 'bound-current' }, recipe: {
          schema: recipe.schema, recipeId: recipe.recipeId, outcome: recipe.outcome, evidence: { ...recipe.evidence, source: { kind: 'owner_mounted_http', id: binding.sourceId } },
          payment: recipe.payment }, merchant, reuse, publicSafeCertified: false, reuseGranted: false,
        repairOutput: 'not_supplied_by_E02', workAcceptedAs: 'changed-source assessment and handback only',
        priorSpend: paymentUnknown(p) ? 'outcome_unknown' : 'none', nextAction: paymentUnknown(p)
          ? 'Reconcile the existing payment attempt by readback; never retry to learn its outcome.'
          : 'E02 must supply a separately reviewed repair artifact if repair is required.' }, {}, useful);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  async function review(input) {
    currentDescriptor();
    requireThat(input.taskId === binding.taskId && input.sourceDigest === binding.sourceDigest, 'foreign_task_or_source');
    const r = rights();
    requireThat(input.reviewer === r.expectedReviewer, 'unauthorized_reviewer');
    const receipt = readReceipt(ownerTenant, input.assessmentId);
    requireThat(receipt.status === 'completed' && receipt.routeId === `${routePrefix}.assess`, 'assessment_unavailable');
    const output = receipt.output;
    requireThat(output?.phase === 'assessment' && output.digest === input.assessmentDigest && canonical(output.binding) === canonical(binding), 'foreign_assessment_or_digest');
    requireThat(['accept', 'reject'].includes(input.decision), 'invalid_review');
    let acceptance = input.decision === 'accept' ? 'accepted' : 'rejected';
    const reasons = blocked(r);
    if (now() >= Date.parse(initial.expiry)) acceptance = 'expiry_winner';
    else if (!r.reviewAllowed || r.mandateState === 'revoked' || Date.parse(r.validUntil) <= now()) acceptance = 'authority_refused';
    else if (output.acceptance !== 'approval_pending' || !output.useful) acceptance = 'not_applicable';
    return finish('handback', output.disposition, acceptance, { assessmentId: receipt.id, assessmentDigest: output.digest,
      repairOutput: 'not_supplied_by_E02', workAcceptedAs: 'changed-source assessment and handback only' }, {
      reviewer: input.reviewer, decision: input.decision, reviewedAt: new Date(now()).toISOString(), rightsRevision: r.revision,
      reasons, acceptanceWinner: acceptance === 'accepted', expiryWinner: acceptance === 'expiry_winner' }, output.useful);
  }
  const routePrefix = `maintenance.${initial.occurrenceId}`;
  return { assess, review, binding, descriptor: initial, routePrefix };
}
function paymentUnknown(prior) { return prior.payment?.attempted === true || prior.payment?.charged === true || !!prior.payment?.receiptId || !!prior.payment?.authorizationId; }
function batch(fields, sourceId, sourceUrl) {
  return { ok: true, product: 'samedaydesk-extract-batch', schemaVersion: 'samedaydesk.extract-batch.v0', quote: null,
    jobId: 'retained-comparison', jobStatus: 'completed', stopReason: null, partial: false,
    sources: [{ id: sourceId, source: sourceUrl, status: 'success', data: fields, error: null, notes: [], provenance: null }],
    accounting: {}, costInputs: {}, charged: false, boundary: {} };
}
