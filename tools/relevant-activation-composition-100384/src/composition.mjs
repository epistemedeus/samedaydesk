/** SPDX-License-Identifier: MIT. No assess, prepare, claim, enrollment or payment dispatch. */
import { executeCommand } from '../vendor/ein-activation-continuation/src/journey.mjs';
import { sha256Json } from '../vendor/ein-activation-continuation/src/catalog.mjs';
import { customerKeyHash } from '../vendor/ein-activation-continuation/src/store.mjs';
import { fail, scopeFor } from './budget.mjs';
import { assessmentInput, checkpointFor, only, relevance, validateTask } from './input.mjs';
import { discoverEIN, readiness } from './services.mjs';
import { readSourceRecords } from './source-records.mjs';

function bindEIN(record, task, checkpoint, env, { beforePreparation = false } = {}) {
  if (!record || record.taskId !== task.taskId || record.operationId !== `task:${task.taskId}`) throw fail('ein_task_mismatch');
  if (record.customerKeyHash !== checkpoint.customerKeyHash) throw fail('caller_mismatch');
  if ((record.taskFingerprint || !beforePreparation) && record.taskFingerprint !== sha256Json(assessmentInput(task))) throw fail('ein_goal_mismatch');
  if ((record.intendedEmail || !beforePreparation) && (!record.intendedEmail
      || customerKeyHash(record.intendedEmail) !== checkpoint.recipientEmailHash
      || record.intendedEmail !== env.EIN_CONTINUATION_INTENDED_EMAIL)) throw fail('ein_recipient_mismatch');
  if (checkpoint.einApplicationId && checkpoint.einApplicationId !== record.applicationId) throw fail('ein_application_mismatch');
  if (record.phase === 'cancelled') throw fail('cancelled');
  if (record.declaredTransport !== checkpoint.einTransport || record.catalogTransport !== checkpoint.einCatalogTransport) throw fail('transport_mismatch');
  if (record.catalog?.termsFingerprint !== checkpoint.einTermsFingerprint) throw fail('terms_changed');
}

export async function compose(command, input, options = {}) {
  const env = options.env ?? process.env;
  const scope = options.scope ?? scopeFor(env, options);
  return scope.run(async () => {
    only(input, ['task', 'checkpoint']);
    const task = validateTask(input.task, env);
    const sourcesDigest = readSourceRecords(task, env);
    const checkpoint = checkpointFor(task, env, input.checkpoint);
    if (checkpoint.sourceRecordsDigest && checkpoint.sourceRecordsDigest !== sourcesDigest && checkpoint.phase !== 'clarify') throw fail('source_record_mismatch');
    checkpoint.sourceRecordsDigest = sourcesDigest;
    const decision = relevance(task);
    const output = { schema: 'samedaydesk.relevant-activation.result.v1', taskId: task.taskId, category: decision.category,
      qualification: { ...decision, authority: 'supplied_assertions', independentlyCertified: false },
      work: null, service: null, nextAction: null, checkpoint,
      productionMutation: false, filingAuthorization: false, revenue: false, taskCompleted: false };
    if (command === 'cancel') {
      checkpoint.phase = 'cancelled';
      output.nextAction = { kind: 'stop', instruction: 'Caller continuation cancelled. The original server case and human status-grant authority remain with the operator.' };
      output.serverCaseCancelled = false;
      output.retainedReadinessInput = task.readiness;
      output.budget = scope.stats();
      return output;
    }
    if (!['plan', 'handoff', 'return'].includes(command)) throw fail('command_refused');
    if (command !== 'plan' && (!input.checkpoint || !decision.qualified)) throw fail('qualification_required');
    if (!decision.qualified) {
      output.work = await readiness(task, env, scope, options.fetch ?? globalThis.fetch);
      checkpoint.phase = decision.field ? 'clarify' : 'no_purchase';
      output.nextAction = decision.field
        ? { kind: 'clarify_prerequisite', requiredInputs: [decision.field], question: decision.question }
        : { kind: 'continue_readiness', action: output.work.nextAction };
      if (decision.documentation) output.documentationAction = { kind: 'existing_documentation', instruction: 'Use the existing entity or EIN documentation and the existing IRS/support route; the catalog has no EIN-only SKU.' };
      output.budget = scope.stats();
      return output;
    }
    if (!env.EIN_CONTINUATION_INTENDED_EMAIL || !checkpoint.recipientEmailHash) throw fail('recipient_required');
    if (!env.EIN_CONTINUATION_FILE) throw fail('ein_continuation_required');
    // Read-only discovery can use all existing transports. Formation writes remain operator actions.
    const live = await discoverEIN(env, scope, options.fetch ?? globalThis.fetch);
    if (checkpoint.einOrigin && checkpoint.einOrigin !== live.origin) throw fail('origin_mismatch');
    if (checkpoint.einTransport && (checkpoint.einTransport !== live.transport || checkpoint.einCatalogTransport !== live.catalogTransport)) throw fail('transport_mismatch');
    if (checkpoint.einTermsFingerprint && checkpoint.einTermsFingerprint !== live.fingerprint) throw fail('terms_changed');
    checkpoint.einOrigin = live.origin;
    checkpoint.einTransport = live.transport;
    checkpoint.einCatalogTransport = live.catalogTransport;
    checkpoint.einTermsFingerprint = live.fingerprint;
    if (command === 'plan') {
      checkpoint.phase = 'qualified';
      output.service = live.discovery;
      output.nextAction = { kind: 'operator_authorized_assess', engine: 'ein-activation-continuation@0.1.3',
        command: 'node vendor/ein-activation-continuation/bin/ein-continuation.mjs assess',
        input: assessmentInput(task), taskId: task.taskId, recipientId: task.recipientId,
        instruction: 'The operator reviews these exact sourced facts and independently runs the existing assess/prepare flow for this task. The adapter has sent neither operation.' };
      let stored;
      try { stored = await executeCommand('show', { env }); }
      catch (error) { if (error.code !== 'continuation_absent') throw error; }
      if (stored) {
        bindEIN(stored.record, task, checkpoint, env, { beforePreparation: true });
        checkpoint.einApplicationId = stored.record.applicationId ?? null;
        output.nextAction = { ...stored.view.nextAction, taskId: task.taskId, recipientId: task.recipientId };
        output.existingAuthority = { source: 'original_ein_continuation',
          assessmentOutcome: stored.view.assessment?.outcome ?? null,
          actionableAuthorized: stored.record.assessment?.actionableAuthorized === true,
          decisionBound: stored.record.assessment?.decisionBound === true };
        // Existing terminal/uncertain assessment wins over a locally supplied relevance assertion.
        if (stored.record.assessment?.terminal || stored.record.phase === 'assess_uncertain') {
          output.service = null;
          output.qualification.qualified = false;
          output.qualification.reason = 'existing_terminal_or_uncertain_assessment';
          checkpoint.phase = stored.record.assessment?.outcome === 'insufficient_information' ? 'clarify' : 'no_purchase';
        }
      }
    } else {
      const shown = await executeCommand('show', { env });
      bindEIN(shown.record, task, checkpoint, env);
      output.existingAuthority = { source: 'original_ein_continuation',
        actionableAuthorized: shown.record.server?.actionableAuthorized === true,
        decisionBound: shown.record.server?.decisionBound === true };
      checkpoint.einApplicationId = shown.record.applicationId ?? null;
      if (command === 'handoff') {
        checkpoint.phase = 'handoff';
        output.nextAction = { ...shown.view.nextAction, taskId: task.taskId, recipientId: task.recipientId };
        // Claim credentials stay in the original private EIN file. Never copy into this checkpoint.
        output.claimLink = { source: 'original_ein_continuation', field: 'claimUrl', privateDeliveryOnly: true };
      } else {
        const remaining = scope.remaining();
        if (remaining < 50) throw fail('deadline_exceeded');
        const observed = await executeCommand('status', {
          env: { ...env, EIN_CONTINUATION_DEADLINE_MS: String(remaining), EIN_CONTINUATION_MAX_RESPONSE_BYTES: String(scope.maxBytes) },
          fetch: scope.fetch(options.fetch ?? globalThis.fetch),
        });
        bindEIN(observed.record, task, checkpoint, env);
        const status = observed.view.observedStatus;
        if (!status || status.source !== 'grant_status') throw fail('missing_status_authority');
        const acted = ['claimed', 'quoted', 'paid', 'async_pending', 'async_failed'].includes(status.applicationStatus);
        checkpoint.phase = acted ? 'operator_observed' : 'handoff';
        output.activation = { ...status, operatorActionObserved: acted, prerequisiteSatisfied: status.complete === true,
          providerApprovalObserved: false, customerUsefulness: 'unknown' };
        output.nextAction = acted ? { kind: 'return_to_readiness', taskId: task.taskId,
          instruction: 'Continue the retained technical readiness task. Use the observed case status for the remaining operator step; claim alone does not supply an entity or EIN.' }
          : { ...observed.view.nextAction, taskId: task.taskId, recipientId: task.recipientId };
      }
    }
    output.work = await readiness(task, env, scope, options.fetch ?? globalThis.fetch);
    if (output.nextAction.kind === 'return_to_readiness') output.nextAction.action = output.work.nextAction;
    output.budget = scope.stats();
    return output;
  });
}
