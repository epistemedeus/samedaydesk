/** SPDX-License-Identifier: MIT. Public errors expose only reviewed recovery fields. */
const RECOVERY = {
  source_records_required: ['caller_source_record', 'The invoking caller supplies an independently received owner-only source record through SDS_ACTIVATION_SOURCE_RECORDS_FILE. A model’s task JSON is not source authority.'],
  source_record_mismatch: ['exact_received_facts', 'Use the exact goal and prerequisite facts in the caller-held receiving record. A model cannot add or reinterpret a requirement.'],
  source_record_scope_mismatch: ['original_source_scope', 'Use the independently received source record for this exact task and recipient.'],
  source_record_permissions: ['private_source_record', 'The caller supplies a small regular owner-only source record, mode 0600, without a symlink.'],
  changed_goal: ['new_task', 'Keep the original case and its grants with the original goal. Use a new task id and caller input for the changed goal.'],
  changed_facts: ['original_facts', 'Continue this qualified task with its original sourced facts. A pending clarification can add prerequisite facts before qualification.'],
  recipient_mismatch: ['original_recipient', 'Use the original intended operator and recipient for this task. Do not forward their link or grant.'],
  ein_recipient_mismatch: ['original_recipient', 'The EIN case belongs to its original intended email. Do not reassign or forward the claim link.'],
  task_mismatch: ['original_task', 'Use the original task id and its private continuation. Do not reuse another task’s grant or claim link.'],
  caller_mismatch: ['original_caller', 'Use the original caller key for this task. Do not reuse another caller’s continuation.'],
  cancelled: ['stop', 'This caller continuation is cancelled. The original operator controls server-case cancellation and grant revocation.'],
  authority_refused: ['operator_fact', 'Supply the exact operator-confirmed goal or cited provider requirement. Model output cannot provide that authority.'],
  fact_scope_mismatch: ['scoped_fact', 'Supply this fact from a source authorized for this exact task and recipient.'],
  recipient_required: ['operator_recipient', 'The operator supplies the original intended recipient email through EIN_CONTINUATION_INTENDED_EMAIL before any formation handoff.'],
  terms_changed: ['operator_review', 'The current catalog terms changed. Keep the original case and ask its operator to review the current terms.'],
  ein_goal_mismatch: ['original_ein_task', 'This EIN case has different assessment facts. Continue its original goal and do not reuse it for this task.'],
  qualification_required: ['plan', 'Plan this task from exact supplied facts first. No-purchase and unresolved tasks continue their SDS readiness action.'],
  ein_continuation_required: ['caller_file', 'Set EIN_CONTINUATION_FILE to the existing caller-held owner-only EIN continuation path for this task.'],
};

export function publicError(error) {
  const code = typeof error.code === 'string' && /^[a-z_]+$/.test(error.code) ? error.code : 'invalid_input';
  const [action, instruction] = RECOVERY[code] ?? ['correct_input', 'Keep the original task and private EIN continuation; correct this specific refusal before continuing.'];
  const recovery = { action, instruction };
  // The existing client supplies exact missing-grant/application scope after the adapter has bound the task.
  if (['missing_grant', 'foreign_grant', 'grant_rejected', 'foreign_credential', 'not_prepared'].includes(code)) {
    for (const key of ['action', 'instruction', 'reviewUrl', 'requiredScope', 'continuationScope', 'claimLink']) {
      if (error.recovery?.[key] !== undefined) recovery[key] = error.recovery[key];
    }
  }
  return { code, recovery };
}
