/** SPDX-License-Identifier: MIT. Facts are supplied assertions, not certification. */
import { sha256Json } from '../vendor/ein-activation-continuation/src/catalog.mjs';
import { customerKeyHash } from '../vendor/ein-activation-continuation/src/store.mjs';
import { fail } from './budget.mjs';

export const TASK_SCHEMA = 'samedaydesk.relevant-activation.task.v1';
export const CHECKPOINT_SCHEMA = 'samedaydesk.relevant-activation.continuation.v1';
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,79}$/;
const TRI = ['yes', 'no', 'unknown'];
const FACTS = ['hasUsEntity', 'hasEin', 'providerPath', 'providerRequiresUsEntity', 'providerRequiresEin', 'jurisdictionKnown', 'selectedState'];
const CHECKPOINT_KEYS = ['schema', 'taskId', 'recipientId', 'customerKeyHash', 'recipientEmailHash', 'goalDigest', 'readinessDigest', 'taskDigest', 'phase', 'einApplicationId', 'einTermsFingerprint', 'einOrigin', 'einTransport', 'einCatalogTransport'];

export function only(value, keys) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Array.isArray(value)
      || Object.keys(value).some((key) => !keys.includes(key))) throw fail('invalid_input');
}

export function bounded(value, depth = 0) {
  if (depth === 0 && Buffer.byteLength(JSON.stringify(value)) > 32768) throw fail('input_limit');
  if (depth > 12) throw fail('input_limit');
  if (typeof value === 'string' && (value.length > 2048 || /[\u0000-\u001f\u007f]/.test(value))) throw fail('invalid_input');
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length > 64) throw fail('input_limit');
    for (const key of keys) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw fail('invalid_input');
      bounded(value[key], depth + 1);
    }
  }
}

function source(value) {
  only(value, ['uri', 'locator']);
  if (typeof value.uri !== 'string' || typeof value.locator !== 'string' || !value.locator.trim()) throw fail('source_required');
  const uri = new URL(value.uri);
  if (uri.protocol === 'urn:') {
    if (!/^urn:[A-Za-z0-9._:-]+$/.test(value.uri)) throw fail('source_refused');
  } else if (uri.protocol !== 'https:' || uri.username || uri.password || uri.search || uri.hash) throw fail('source_refused');
}

function fact(value, task, kind) {
  only(value, ['value', 'source', 'authority']);
  source(value.source);
  only(value.authority, ['kind', 'id', 'taskId', 'recipientId']);
  if (value.authority.kind !== kind || typeof value.authority.id !== 'string' || !value.authority.id) throw fail('authority_refused');
  if (value.authority.taskId !== task.taskId || value.authority.recipientId !== task.recipientId) throw fail('fact_scope_mismatch');
  if (kind === 'operator' && value.authority.id !== task.recipientId) throw fail('authority_refused');
}

export function validateTask(task, env) {
  bounded(task);
  only(task, ['schema', 'taskId', 'recipientId', 'goal', 'facts', 'readiness']);
  if (task.schema !== TASK_SCHEMA || !ID.test(task.taskId) || !ID.test(task.recipientId)) throw fail('invalid_input');
  if (env.EIN_CONTINUATION_TASK_ID !== task.taskId) throw fail('task_mismatch');
  if (env.SDS_ACTIVATION_RECIPIENT_ID !== task.recipientId) throw fail('recipient_mismatch');
  const key = env.EIN_CONTINUATION_CUSTOMER_KEY;
  if (typeof key !== 'string' || key.length < 12 || key.length > 128 || /\s/.test(key)) throw fail('caller_authority_required');
  only(task.goal, ['value', 'intent', 'source', 'authority']);
  if (typeof task.goal.value !== 'string' || !task.goal.value || task.goal.value.length > 500
      || task.goal.value !== task.goal.value.trim()
      || !['technical_integration', 'formation', 'operator_setup', 'unknown'].includes(task.goal.intent)) throw fail('invalid_goal');
  fact({ value: task.goal.value, source: task.goal.source, authority: task.goal.authority }, task, 'operator');
  only(task.facts, FACTS);
  for (const [name, value] of Object.entries(task.facts)) {
    const kind = name.startsWith('providerRequires') ? 'provider' : 'operator';
    fact(value, task, kind);
    if (name.startsWith('providerRequires') && value.authority.id !== task.facts.providerPath?.value) throw fail('provider_path_mismatch');
    if (['providerPath', 'selectedState'].includes(name)) {
      if (typeof value.value !== 'string' || !value.value || value.value.length > 80) throw fail('invalid_fact');
    } else if (!TRI.includes(value.value)) throw fail('invalid_fact');
  }
  only(task.readiness, ['catalogRow', 'responseContract']);
  return task;
}

export function assessmentInput(task) {
  return Object.fromEntries([
    ['goal', task.goal.value],
    ...Object.entries(task.facts).filter(([key]) => key !== 'providerPath').map(([key, fact]) => [key, fact.value]),
  ]);
}

export function checkpointFor(task, env, previous) {
  const next = {
    schema: CHECKPOINT_SCHEMA, taskId: task.taskId, recipientId: task.recipientId,
    customerKeyHash: customerKeyHash(env.EIN_CONTINUATION_CUSTOMER_KEY),
    recipientEmailHash: env.EIN_CONTINUATION_INTENDED_EMAIL ? customerKeyHash(env.EIN_CONTINUATION_INTENDED_EMAIL) : null,
    goalDigest: sha256Json(task.goal), readinessDigest: sha256Json(task.readiness), taskDigest: sha256Json(task),
    phase: 'planned', einApplicationId: null, einTermsFingerprint: null,
    einOrigin: null, einTransport: null, einCatalogTransport: null,
  };
  if (!previous) return next;
  bounded(previous);
  only(previous, CHECKPOINT_KEYS);
  if (previous.schema !== CHECKPOINT_SCHEMA || previous.taskId !== next.taskId) throw fail('task_mismatch');
  if (previous.recipientId !== next.recipientId || previous.recipientEmailHash !== next.recipientEmailHash) throw fail('recipient_mismatch');
  if (previous.customerKeyHash !== next.customerKeyHash) throw fail('caller_mismatch');
  if (previous.goalDigest !== next.goalDigest || previous.readinessDigest !== next.readinessDigest) throw fail('changed_goal');
  if (previous.taskDigest !== next.taskDigest && previous.phase !== 'clarify') throw fail('changed_facts');
  if (previous.phase === 'cancelled') throw fail('cancelled');
  return { ...previous, taskDigest: next.taskDigest };
}

export function relevance(task) {
  const value = (key) => task.facts[key]?.value ?? 'unknown';
  const clarify = (field, question) => ({ category: 'unknown_prerequisite', qualified: false, field, question });
  if (task.goal.intent === 'technical_integration') return { category: 'technical_integration', qualified: false, reason: 'operator_confirmed_technical_task' };
  if (value('hasUsEntity') === 'yes') return { category: 'existing_business_setup', qualified: false, reason: value('hasEin') === 'yes' ? 'existing_entity_and_ein' : 'existing_entity_no_second_llc', documentation: value('hasEin') !== 'yes' };
  if (task.goal.intent === 'unknown') return clarify('goal.intent', 'Is this task technical integration, setup of an existing business, or an explicitly chosen formation goal?');
  if (value('providerPath') === 'unknown') return clarify('facts.providerPath', 'Which exact provider or operator setup path did you select?');
  if (value('providerRequiresUsEntity') === 'unknown') return clarify('facts.providerRequiresUsEntity', `Does the selected ${value('providerPath')} path require a US entity? Supply its written yes/no requirement with source and provider authority.`);
  if (value('providerRequiresUsEntity') === 'no') return { category: 'technical_integration', qualified: false, reason: value('providerRequiresEin') === 'yes' ? 'ein_only_no_llc_service' : 'no_us_entity_prerequisite', documentation: value('providerRequiresEin') === 'yes' };
  if (value('hasUsEntity') === 'unknown') return clarify('facts.hasUsEntity', 'Does the operator already have a US entity for this selected path?');
  if (value('jurisdictionKnown') !== 'yes' || value('selectedState') === 'unknown') return clarify('facts.selectedState', 'Which state has the operator selected for this new entity? Supply that decision before preparation.');
  return { category: 'confirmed_formation_goal', qualified: true, reason: 'operator_goal_and_sourced_selected_path_requirement', basis: ['goal', 'facts.providerPath', 'facts.providerRequiresUsEntity', 'facts.hasUsEntity', 'facts.selectedState'] };
}
