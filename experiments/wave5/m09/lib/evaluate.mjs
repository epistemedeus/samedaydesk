export function evaluateReplay(caseDef, spawn) {
  const expected = caseDef.expected;
  const failures = [];
  const transportOk = spawn.exitCode === 0 && spawn.body?.ok === true && spawn.body?.report;

  if (expected.transportOk === false) {
    const code = spawn.refusal?.code ?? spawn.body?.code ?? null;
    if (spawn.exitCode === 0) failures.push("expected_refusal_got_exit_0");
    if (expected.code && code !== expected.code) {
      failures.push(`expected_code_${expected.code}_got_${code ?? "none"}`);
    }
    return {
      id: caseDef.id,
      control: caseDef.control,
      transportOk: false,
      transportFailure: false,
      analysisOutcome: null,
      refusalCode: code,
      expected,
      failures,
      ok: failures.length === 0,
      remainingBinding: expected.remainingBinding ?? null,
    };
  }

  if (spawn.error || spawn.timedOut || spawn.exitCode === null) {
    failures.push(`engine_or_transport_failure:${spawn.error ?? spawn.signal ?? "null_exit"}`);
    return {
      id: caseDef.id,
      control: caseDef.control,
      transportOk: false,
      transportFailure: true,
      analysisOutcome: null,
      expected,
      failures,
      ok: false,
      remainingBinding: expected.remainingBinding ?? null,
    };
  }

  if (!transportOk) {
    failures.push(`expected_transport_ok_exit_${spawn.exitCode}_code_${spawn.refusal?.code ?? "none"}`);
    return {
      id: caseDef.id,
      control: caseDef.control,
      transportOk: false,
      transportFailure: spawn.exitCode !== 2,
      analysisOutcome: null,
      refusalCode: spawn.refusal?.code ?? null,
      expected,
      failures,
      ok: false,
      remainingBinding: expected.remainingBinding ?? null,
    };
  }

  const report = spawn.body.report;
  if (report.verdict !== expected.verdict) {
    failures.push(`verdict_${report.verdict}_expected_${expected.verdict}`);
  }
  if (expected.semantic !== undefined && report.summary.semantic !== expected.semantic) {
    failures.push(`semantic_${report.summary.semantic}_expected_${expected.semantic}`);
  }
  if (expected.minSemantic !== undefined && report.summary.semantic < expected.minSemantic) {
    failures.push(`semantic_${report.summary.semantic}_lt_${expected.minSemantic}`);
  }
  if (expected.usefulOutputProven !== undefined
    && report.claims.usefulOutputProven !== expected.usefulOutputProven) {
    failures.push(`usefulOutputProven_${report.claims.usefulOutputProven}`);
  }
  if (expected.freshness !== undefined && report.freshness !== expected.freshness) {
    failures.push(`freshness_${report.freshness}_expected_${expected.freshness}`);
  }
  if (expected.changePathIncludes) {
    const hit = (report.changes ?? []).some((change) =>
      String(change.path ?? "").includes(expected.changePathIncludes));
    if (!hit) failures.push(`missing_change_path_${expected.changePathIncludes}`);
  }
  if (expected.omittedChangePath) {
    const hit = (report.changes ?? []).some((change) =>
      String(change.path ?? "").includes(expected.omittedChangePath));
    if (hit) failures.push(`unexpected_change_path_${expected.omittedChangePath}`);
    if (report.snapshot?.after?.truncated === true || report.snapshot?.before?.truncated === true) {
      failures.push("snapshot_truncated_true_on_silent_omission");
    }
  }
  if (expected.coverageUnknownField) {
    const hit = (report.coverageUnknown ?? []).some((item) =>
      item.field === expected.coverageUnknownField
      && item.reason === "absent_field_is_coverage_unknown_not_deletion");
    if (!hit) failures.push(`missing_coverage_unknown_${expected.coverageUnknownField}`);
  }
  if (report.provenance?.networkUsed !== false) failures.push("networkUsed");
  if (report.claims?.paymentImpliesUsefulOutput !== false) {
    failures.push("paymentImpliesUsefulOutput");
  }
  if (report.schema !== "pilot/page-change-brief/v1") {
    failures.push(`schema_${report.schema}`);
  }

  return {
    id: caseDef.id,
    control: caseDef.control,
    transportOk: true,
    transportFailure: false,
    analysisOutcome: report.verdict,
    summary: report.summary,
    usefulOutputProven: report.claims.usefulOutputProven,
    freshness: report.freshness,
    expected,
    failures,
    ok: failures.length === 0,
    remainingBinding: expected.remainingBinding ?? null,
  };
}
