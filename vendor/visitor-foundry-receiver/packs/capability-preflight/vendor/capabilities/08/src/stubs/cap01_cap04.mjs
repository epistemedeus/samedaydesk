/**
 * Minimal Cap01/Cap04 schema-compatible stubs used when sibling trees are absent.
 * Not a re-implementation of Cap01/04 — fixture-driven envelopes for Cap08 demos.
 */

export function stubBuildTaskRequirementsEnvelope(rawInput, { clock = () => Date.now() } = {}) {
  const req = rawInput?.requirements ?? rawInput ?? {};
  const taskId = typeof req.taskId === "string" && req.taskId.trim() ? req.taskId.trim() : "unknown";
  const requiredFields = Array.isArray(req.artifact?.requiredFields)
    ? req.artifact.requiredFields
    : [];
  const objectiveCriteria = Array.isArray(req.objectiveCriteria) ? req.objectiveCriteria : [];
  const ready = Boolean(req.taskId && req.title && req.summary && requiredFields.length > 0);

  return {
    schema: "pilot.r2.capabilities.task_requirements_envelope.v1",
    taskId,
    title: req.title ?? null,
    summary: req.summary ?? null,
    generatedAt: new Date(clock()).toISOString(),
    status: ready ? "ready" : "partial_input",
    requirementsRef: {
      schema: "neomorphic.r2.exchange.task_requirements.v1",
      reuseFrom: "R2-EXCHANGE-01",
      stubNote: "Cap08 thin stub — prefer real Cap01 when sibling worktree present",
    },
    requiredInputs: [
      {
        id: "task_requirements",
        name: "Task requirements document",
        kind: "task_requirements",
        required: true,
        source: "caller",
      },
    ],
    outputConstraints: ready
      ? {
          format: req.artifact?.format || "json",
          maxBytes: req.artifact?.maxBytes ?? null,
          requiredFields,
          objectiveChecks: objectiveCriteria.map((c) => ({
            id: c.id,
            description: c.description,
            check: c.check,
          })),
        }
      : null,
    acceptableEvidence: ready
      ? {
          objective: objectiveCriteria.map((c) => ({
            id: c.id,
            checkKind: c.check?.kind ?? null,
            description: c.description,
            path: c.check?.path ?? null,
          })),
          subjectiveUnresolved: (req.subjectiveCriteria || []).map((c) => ({
            id: c.id,
            description: c.description,
            status: "unresolved",
            reviewHint: c.reviewHint,
          })),
        }
      : null,
    missingInputs: ready
      ? []
      : [
          {
            id: "task_requirements",
            name: "Valid task requirements",
            kind: "task_requirements",
            required: true,
            source: "stub",
          },
        ],
    demo: req.demo === true,
    stub: true,
    dependsOn: "R2-CAPABILITIES-01",
  };
}

export function stubBuildCostDryRunComparison(rawInput, { clock = () => Date.now() } = {}) {
  const quotes = Array.isArray(rawInput?.quotes) ? rawInput.quotes : [];
  const freeAlternatives = Array.isArray(rawInput?.freeAlternatives)
    ? rawInput.freeAlternatives
    : [];
  const comparisons = quotes.map((q) => {
    const present = q.amountAtomic != null && String(q.amountAtomic).length > 0;
    const priceState = !present
      ? "missing_price"
      : q.stale === true || q.priceSource === "fixture.demo.not-a-live-offer"
        ? "stale_or_untrusted_source"
        : Array.isArray(q.externalCosts) && q.externalCosts.length > 0
          ? "external_cost"
          : "quoted";
    return {
      quoteId: q.id ?? q.quoteId ?? "quote",
      label: q.label ?? q.id ?? "quote",
      priceState,
      amountAtomic: present ? String(q.amountAtomic) : null,
      currency: present ? q.currency ?? null : null,
      priceSource: q.priceSource ?? "fixture.demo.not-a-live-offer",
      externalCosts: q.externalCosts ?? [],
      unit: q.unit ?? null,
      freeAlternatives: freeAlternatives.map((fa) => ({
        id: fa.id,
        state: fa.state,
        label: fa.label,
        basis: fa.basis,
      })),
      notes: [],
    };
  });

  const hasMissing = comparisons.some((c) => c.priceState === "missing_price");
  const status =
    quotes.length === 0
      ? "rejected"
      : hasMissing || freeAlternatives.length === 0
        ? "partial_input"
        : "ready";

  return {
    schema: "pilot.r2.capabilities.cost_dry_run_comparison.v1",
    taskId: rawInput?.taskId ?? null,
    capabilityId: rawInput?.capabilityId ?? null,
    generatedAt: new Date(clock()).toISOString(),
    status,
    demo: rawInput?.demo === true,
    comparisons,
    missingInputs: status === "partial_input" ? ["stub_partial"] : [],
    dryRun: true,
    paidCalls: false,
    dryRunNote:
      "Cap08 thin stub — prefer real Cap04 when sibling worktree present; never fetch live paid offers.",
    stub: true,
    dependsOn: "R2-CAPABILITIES-04",
  };
}
