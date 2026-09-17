import { fail } from "./failures.mjs";
import { isAllowedEvidenceClass, isOwnerIdentity } from "./labels.mjs";

function demandIsRepeat(value) {
  return value === "repeat_demand" || value === "repeat-demand" || value === "repeatDemand";
}

/**
 * Label owner QA vs independent. Refuse same fixture twice as repeat demand.
 * Classification does not spawn the engine; the caller still has to run it.
 */
export function classifyPair(resolved) {
  if (resolved.ok !== true) return resolved;
  const [run1, run2] = resolved.runs;
  if (!run1 || !run2) {
    return fail("needs_two_runs");
  }

  for (const run of resolved.runs) {
    if (!run.evidenceClass) {
      return fail("missing_evidence_class", `run ${run.id} is missing evidenceClass`, {
        runId: run.id,
      });
    }
    if (!isAllowedEvidenceClass(run.evidenceClass)) {
      return fail(
        "unknown_evidence_class",
        `run ${run.id} evidenceClass ${run.evidenceClass} is not owner_qa/independent/recruited/unknown`,
        { runId: run.id, evidenceClass: run.evidenceClass },
      );
    }
    if (run.evidenceClass === "independent" && isOwnerIdentity(run.callerIdentity)) {
      return fail(
        "owner_identity_labelled_independent",
        `run ${run.id} callerIdentity ${run.callerIdentity || "pack-operator"} cannot be independent`,
        { runId: run.id, callerIdentity: run.callerIdentity },
      );
    }
  }

  const sameFixture = run1.fingerprint === run2.fingerprint;
  const pairDemand = resolved.demandClass;
  const runDemand = run1.demandClass || run2.demandClass;
  const labelledRepeat = demandIsRepeat(pairDemand) || demandIsRepeat(runDemand);

  if (sameFixture && labelledRepeat) {
    return fail("same_fixture_labelled_repeat_demand", undefined, {
      seeded: "same_fixture_labelled_repeat_demand",
      fingerprint: run1.fingerprint,
      demandClass: pairDemand,
    });
  }
  if (sameFixture) {
    return fail("same_fixture_not_changed_input", undefined, {
      fingerprint: run1.fingerprint,
    });
  }
  if (labelledRepeat) {
    const ownerTouched =
      run1.evidenceClass === "owner_qa" ||
      run2.evidenceClass === "owner_qa" ||
      isOwnerIdentity(run1.callerIdentity) ||
      isOwnerIdentity(run2.callerIdentity);
    if (ownerTouched) {
      return fail("owner_qa_labelled_repeat_demand", undefined, { demandClass: pairDemand });
    }
    return fail("unproven_repeat_demand", undefined, { demandClass: pairDemand });
  }

  const labelsDistinct = run1.evidenceClass !== run2.evidenceClass;
  return {
    ok: true,
    changedInput: true,
    secondRun: true,
    repeatDemand: false,
    organicDemand: false,
    labels: {
      run1: run1.evidenceClass,
      run2: run2.evidenceClass,
      distinct: labelsDistinct,
      collapsed: false,
    },
    fingerprints: {
      run1: run1.fingerprint,
      run2: run2.fingerprint,
    },
  };
}
