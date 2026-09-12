function changeText(change) {
  return [
    change.path,
    change.class,
    change.op,
    change.before,
    change.after,
    change.beforeEvidence,
    change.afterEvidence,
  ]
    .filter((part) => part != null)
    .map(String)
    .join("\n");
}

function allChangeText(report) {
  return (report.changes ?? []).map(changeText).join("\n---\n");
}

export function evaluateReport(caseDef, spawn, written) {
  const expected = caseDef.expected;
  const failures = [];
  const report = written?.report ?? spawn.body?.report ?? null;
  const code = spawn.errBody?.code ?? spawn.body?.code ?? null;

  if (expected.transportOk === false) {
    if (spawn.exitCode === 0) failures.push("expected_refusal_got_exit_0");
    if (expected.exitCode != null && spawn.exitCode !== expected.exitCode) {
      failures.push(`exit_${spawn.exitCode}_expected_${expected.exitCode}`);
    }
    if (expected.code && code !== expected.code) {
      failures.push(`code_${code ?? "none"}_expected_${expected.code}`);
    }
    return {
      id: caseDef.id,
      ok: failures.length === 0,
      failures,
      exitCode: spawn.exitCode,
      code,
      verdict: report?.verdict ?? null,
      counterexample: failures.length ? { stderr: spawn.stderr.trim(), code } : null,
    };
  }

  if (spawn.exitCode !== (expected.exitCode ?? 0)) {
    failures.push(`exit_${spawn.exitCode}_expected_${expected.exitCode ?? 0}_code_${code ?? "none"}`);
  }
  if (!report) {
    failures.push("missing_report");
    return {
      id: caseDef.id,
      ok: false,
      failures,
      exitCode: spawn.exitCode,
      code,
      verdict: null,
      counterexample: { stdout: spawn.stdout.slice(0, 1500), stderr: spawn.stderr.slice(0, 1500) },
    };
  }

  if (report.verdict !== expected.verdict) {
    failures.push(`verdict_${report.verdict}_expected_${expected.verdict}`);
  }
  if (expected.engineVersion && report.provenance?.engineVersion !== expected.engineVersion) {
    failures.push(`engineVersion_${report.provenance?.engineVersion}_expected_${expected.engineVersion}`);
  }
  if (expected.networkUsed === false && report.provenance?.networkUsed !== false) {
    failures.push("networkUsed_not_false");
  }
  if (expected.claimsFresh === false && report.claims?.fresh !== false) {
    failures.push("claims.fresh_not_false");
  }

  const claims = report.claims ?? {};
  for (const [key, value] of Object.entries(expected.claims ?? {})) {
    if (claims[key] !== value) failures.push(`claims.${key}_${claims[key]}_expected_${value}`);
  }

  const paths = (report.changes ?? []).map((change) => change.path);
  for (const path of expected.requiredPaths ?? []) {
    if (!paths.includes(path)) failures.push(`missing_path_${path}`);
  }
  for (const path of expected.forbiddenPaths ?? []) {
    if (paths.includes(path)) failures.push(`unexpected_path_${path}`);
  }
  if (expected.forbiddenSemantic && (report.changes ?? []).some((change) => change.class === "semantic")) {
    failures.push("unexpected_semantic_change");
  }
  if (expected.changeClass) {
    const hit = (report.changes ?? []).some((change) => change.class === expected.changeClass);
    if (!hit) failures.push(`missing_class_${expected.changeClass}`);
  }
  if (expected.forbiddenOps) {
    for (const change of report.changes ?? []) {
      if (expected.forbiddenOps.includes(change.op) && change.class === "semantic") {
        failures.push(`unexpected_op_${change.op}_${change.path}`);
      }
    }
  }

  const blob = allChangeText(report);
  for (const pair of expected.tokenPairs ?? []) {
    if (!blob.includes(pair.before) || !blob.includes(pair.after)) {
      failures.push(`missing_${pair.kind}_tokens_${pair.before}→${pair.after}`);
    }
  }

  if (expected.coverageField) {
    const items = report.coverageUnknown ?? [];
    const hit = items.some((item) => item.field === expected.coverageField);
    if (!hit) failures.push(`coverageUnknown_missing_field_${expected.coverageField}`);
    if (expected.coverageReason) {
      const reasonHit = items.some((item) => item.reason === expected.coverageReason);
      if (!reasonHit) failures.push(`coverageUnknown_missing_reason_${expected.coverageReason}`);
    }
  }

  if (expected.failedSource) {
    const failed = report.rows?.failed ?? [];
    const hit = failed.some((item) => item.sourceKey === expected.failedSource || item.source === expected.failedSource);
    if (!hit && failed.length === 0) failures.push("rows.failed_empty");
    else if (!hit) failures.push(`rows.failed_missing_${expected.failedSource}`);
  }

  if (expected.duplicateSource) {
    const dupes = report.rows?.duplicates ?? [];
    const hit = dupes.some((item) => item.sourceKey === expected.duplicateSource);
    if (!hit) failures.push(`duplicates_missing_${expected.duplicateSource}`);
  }
  if (expected.silentReplaceForbidden) {
    const silent = (report.changes ?? []).some(
      (change) => change.class === "semantic" && change.path === "/title" && report.verdict === "changed",
    );
    if (silent) failures.push("ambiguous_collapsed_to_silent_title_replace");
  }

  if (expected.maxChanges) {
    const recorded = report.changes ?? [];
    if (recorded.length !== expected.maxChanges) {
      failures.push(`changes_length_${recorded.length}_expected_${expected.maxChanges}`);
    }
    const hits = report.snapshot?.limitsHit ?? [];
    if (!hits.includes(expected.limitsHit)) {
      failures.push(`limitsHit_missing_${expected.limitsHit}_got_${hits.join(",") || "none"}`);
    }
    if (claims.complete === true) {
      failures.push("complete_true_while_max-changes_omits_siblings");
    }
    const siblingPaths = ["/title", "/description", "/headings/h1"];
    const recordedSiblings = siblingPaths.filter((path) => paths.includes(path));
    if (recordedSiblings.length === siblingPaths.length) {
      failures.push("max-changes_did_not_omit_any_sibling");
    }
  }

  return {
    id: caseDef.id,
    ok: failures.length === 0,
    failures,
    exitCode: spawn.exitCode,
    verdict: report.verdict,
    claims: {
      usefulOutputProven: claims.usefulOutputProven,
      contentUnchangedProven: claims.contentUnchangedProven,
      complete: claims.complete,
      noChangeProven: claims.noChangeProven,
    },
    paths,
    limitsHit: report.snapshot?.limitsHit ?? [],
    freshness: report.freshness,
    engineVersion: report.provenance?.engineVersion ?? null,
    counterexample: failures.length
      ? {
          verdict: report.verdict,
          claims,
          changes: (report.changes ?? []).map((change) => ({
            class: change.class,
            op: change.op,
            path: change.path,
            before: change.before,
            after: change.after,
          })),
          coverageUnknown: report.coverageUnknown,
          rows: {
            failed: report.rows?.failed,
            duplicates: report.rows?.duplicates,
          },
          limitsHit: report.snapshot?.limitsHit,
          failures,
        }
      : null,
  };
}
