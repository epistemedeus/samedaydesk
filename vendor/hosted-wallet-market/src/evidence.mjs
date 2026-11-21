function need(ok, code) {
  if (!ok) throw Object.assign(new Error(code), {codeName: code});
}

// Same acceptance rules as the packed client's continuityEvidence.
export function continuityEvidence(e) {
  const structured = e?.resultOrReason && typeof e.resultOrReason === 'object' && !Array.isArray(e.resultOrReason) && Object.keys(e.resultOrReason).length > 0;
  need(e?.schema === 'pilot.continuity-report.v1' && ['completed', 'refused', 'failed', 'unresolved'].includes(e.businessStatus) && typeof e.commandID === 'string' && e.commandID.length > 0 && (e.httpStatus === null || Number.isInteger(e.httpStatus) && e.httpStatus >= 100 && e.httpStatus <= 599) && (structured || typeof e.resultOrReason === 'string' && e.resultOrReason.length > 0) && e.executionRef?.length > 0 && e.inputRef?.length > 0 && e.outputRef?.length > 0 && e.versions?.length > 0 && Number.isFinite(e.effortMinutes) && e.effortMinutes > 0 && e.effortMinutes <= 20 && Number.isInteger(e.clarifications) && e.clarifications >= 0 && e.clarifications <= 1 && ['measured', 'unmeasured'].includes(e.directComparison?.status), 'new_owned_runtime_evidence_required');
  const retained = e.storedReadbackRef?.length > 0;
  const used = e.nextStep?.reference?.length > 0 && e.nextStep?.decision?.length > 0;
  if (e.httpStatus === null) need(e.businessStatus !== 'completed' && e.failureStage?.evidenceRef?.length > 0 && e.failureStage?.reason?.length > 0, 'truthful_missing_http_evidence_required');
  if (!retained || !used) {
    need(e.businessStatus !== 'completed' && e.failureStage?.evidenceRef?.length > 0 && e.failureStage?.reason?.length > 0, 'missing_stage_evidence_required');
    if (!retained) need(['not_reached', 'refused', 'unknown'].includes(e.storageOutcome), 'truthful_storage_outcome_required');
    if (!used) need(e.nextStep?.state === 'not_reached' && e.nextStep.reason?.length > 0, 'truthful_next_step_outcome_required');
  }
  if (e.directComparison.status === 'measured') need(e.directComparison.sameInputRef === e.inputRef && e.directComparison.resultRef?.length > 0, 'same_direct_input_required');
  else need(e.directComparison.reason?.length > 0, 'unmeasured_reason_required');
  need(e.observed === true && e.sanitizedOwnedInput === true, 'observed_owned_evidence_required');
  return e;
}
