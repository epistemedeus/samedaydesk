/**
 * Full Cap01–08 consumer journey via existing modules (interfaces finished here).
 * Cap02/03/06: s138 @ HEAVY_PIN. Cap01/04/05/07/08: scale-r2 native packages.
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildTaskRequirementsEnvelope } from "../vendor/capabilities/01/src/index.mjs";
import { buildCostDryRunComparison } from "../vendor/capabilities/04/src/index.mjs";
import { buildFailureFallbackPlan } from "../vendor/capabilities/05/src/index.mjs";
import { buildBuyerContextPack } from "../vendor/capabilities/07/src/index.mjs";
import { runInstallFirstResultWalkthrough } from "../vendor/capabilities/08/src/index.mjs";
import {
  resolvePrerequisites,
  bindEvidence,
  composePartial,
} from "../vendor/s138-capability-evidence/src/index.mjs";

import {
  HEAVY_PIN,
  HONESTY_NOTES,
  IMPORT_PATHS,
  MUTATION_BOUNDARY,
  SCHEMA,
} from "./constants.mjs";
import { scrubPortable } from "./portable.mjs";
import { buildProbeForResolve, runLocalProbes } from "./probes.mjs";
import { classifyCostLanes, classifyEvidenceTrust } from "./trust.mjs";
import { buildNextStepManifest } from "./next-step.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KIT_ROOT = join(__dirname, "..");
const PORTABLE_OPTS = { kitRoot: KIT_ROOT };

const STAGE_SUCCESS = Object.freeze({
  envelope: "ready",
  cost: "ready",
  contextPack: "ready",
  walkthrough: "ready",
  compose: "complete",
  evidence: "content_bound",
  prerequisites: "ready",
});

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function sha256Text(text) {
  return createHash("sha256").update(String(text)).digest("hex");
}

function loadKitFixture(name) {
  const p = join(KIT_ROOT, "fixtures", name);
  if (!existsSync(p)) return null;
  if (name.endsWith(".json")) return JSON.parse(readFileSync(p, "utf8"));
  return readFileSync(p, "utf8");
}

function contentBoundOk(status) {
  return status === "content_bound";
}

function isDemoJourney(input, opts) {
  if (opts.demo === false || input.demo === false) return false;
  if (opts.demo === true || input.demo === true) return true;
  return false;
}

function walkthroughVerifyFailures(walkthrough) {
  const stages = Array.isArray(walkthrough?.stages) ? walkthrough.stages : [];
  const verify = stages.find((s) => s.id === "verify");
  const failures = verify?.result?.failures;
  return Array.isArray(failures) ? failures : [];
}

function missingInputIds(record) {
  if (!record || !Array.isArray(record.missingInputs)) return [];
  return record.missingInputs.map((m) => (typeof m === "string" ? m : m?.id)).filter(Boolean);
}

/**
 * Run the complete portable capability-consumer journey.
 * @param {object} input
 * @param {object} [opts]
 */
export async function runCapabilityConsumerJourney(input = {}, opts = {}) {
  const clock = opts.clock || (() => Date.now());
  const generatedAt = new Date(clock()).toISOString();

  if (!isPlainObject(input)) {
    return scrubPortable({
      schema: SCHEMA,
      generatedAt,
      status: "rejected",
      readyForRelease: false,
      error: { code: "invalid_input", message: "journey input must be a plain object" },
      honestyNotes: [...HONESTY_NOTES],
    }, PORTABLE_OPTS);
  }

  const demoMode = isDemoJourney(input, opts);

  const blank = Object.keys(input).length === 0 || input.blank === true;
  if (blank) {
    return scrubPortable({
      schema: SCHEMA,
      generatedAt,
      status: "blank_input",
      readyForRelease: false,
      paidCalls: false,
      liveNetwork: false,
      gaps: [{ field: "input", reason: "blank input; missing evidence is unknown" }],
      honestyNotes: [...HONESTY_NOTES],
      nextStep: buildNextStepManifest({ schema: SCHEMA, stages: {} }),
    }, PORTABLE_OPTS);
  }

  const stages = {};
  const gaps = [];

  // --- Cap01 envelope ---
  let envelope = null;
  try {
    envelope = buildTaskRequirementsEnvelope(
      input.requirements ?? input.envelopeInput ?? null,
      { clock },
    );
    stages.envelope = {
      cap: "01",
      status: envelope.status,
      taskId: envelope.taskId,
      importPath: IMPORT_PATHS.cap01,
    };
    if (envelope.status !== STAGE_SUCCESS.envelope) {
      gaps.push({
        field: "envelope.status",
        reason: envelope.status,
        missingInputs: missingInputIds(envelope),
      });
    }
  } catch (err) {
    stages.envelope = { cap: "01", status: "failed", error: err.message };
    gaps.push({ field: "envelope", reason: err.message });
  }

  // --- Cap02 prerequisites (optional explicit local probes) ---
  const manifest = input.prerequisites?.manifest ?? input.manifest ?? null;
  const probeFlag = input.probe === true || opts.probe === true;
  const packageRoot = input.packageRoot || opts.packageRoot || KIT_ROOT;
  const localProbe = runLocalProbes({
    probe: probeFlag,
    manifest: manifest || {},
    packageRoot,
  });
  const probe = buildProbeForResolve(localProbe, input.prerequisites?.probe ?? input.probeData ?? {});

  let prereq = null;
  if (!isPlainObject(manifest)) {
    stages.prerequisites = {
      cap: "02",
      readiness: "unknown",
      note: "manifest missing; readiness unknown (not default false/true)",
      probeInvoked: localProbe.invoked,
    };
    gaps.push({ field: "manifest", reason: "missing; unknown" });
  } else {
    prereq = resolvePrerequisites({
      manifest,
      manifestKind: input.prerequisites?.manifestKind ?? input.manifestKind,
      catalogListed: input.prerequisites?.catalogListed === true || input.catalogListed === true,
      probe,
    });
    stages.prerequisites = {
      cap: "02",
      readiness: prereq.readiness,
      gaps: prereq.gaps,
      probeInvoked: localProbe.invoked,
      probeProvenance: probe.provenance || null,
      importPath: IMPORT_PATHS.heavy,
      report: prereq,
    };
    if (prereq.readiness !== STAGE_SUCCESS.prerequisites) {
      gaps.push({ field: "prerequisites.readiness", reason: prereq.readiness });
    }
  }

  // --- Cap03 bindEvidence ---
  let binding = null;
  const evidenceIn = input.evidence ?? input.bindEvidence ?? null;
  if (!isPlainObject(evidenceIn) || !isPlainObject(evidenceIn.declaration)) {
    stages.evidence = {
      cap: "03",
      status: "unknown",
      note: "declaration missing; untested / unknown (not invented content_bound)",
    };
    gaps.push({ field: "evidence.declaration", reason: "missing" });
  } else if (evidenceIn.tamperedBinding && typeof evidenceIn.tamperedBinding === "object") {
    stages.evidence = {
      cap: "03",
      status: "tampered_rejected",
      note: "Caller-supplied pre-bound status ignored; only library bindEvidence output is authoritative",
      claimedTamper: scrubPortable(evidenceIn.tamperedBinding, PORTABLE_OPTS),
    };
    gaps.push({ field: "evidence", reason: "tampered binding rejected" });
  } else {
    try {
      binding = bindEvidence({
        declaration: evidenceIn.declaration,
        source: evidenceIn.source,
        testOutput: evidenceIn.testOutput,
        provenance: evidenceIn.provenance,
        executionVerified: evidenceIn.executionVerified,
      });
      stages.evidence = {
        cap: "03",
        status: binding.status,
        executionVerified: binding.executionVerified,
        importPath: IMPORT_PATHS.heavy,
        report: binding,
      };
      if (!contentBoundOk(binding.status)) {
        gaps.push({ field: "evidence.status", reason: binding.status });
      }
    } catch (err) {
      binding = null;
      stages.evidence = {
        cap: "03",
        status: "failed",
        error: err.message,
        executionVerified: false,
      };
      gaps.push({ field: "evidence", reason: err.message });
    }
  }

  // --- Cap04 cost dry-run ---
  let cost = null;
  try {
    cost = buildCostDryRunComparison(input.costInput ?? null, { clock });
    stages.cost = {
      cap: "04",
      status: cost.status,
      dryRun: cost.dryRun === true,
      paidCalls: cost.paidCalls,
      importPath: IMPORT_PATHS.cap04,
      costLanes: classifyCostLanes(cost),
      report: cost,
    };
    if (cost.status !== STAGE_SUCCESS.cost) {
      gaps.push({
        field: "cost.status",
        reason: cost.status,
        missingInputs: missingInputIds(cost),
      });
    }
    if (Array.isArray(input.costInput?.quotes)) {
      for (const q of input.costInput.quotes) {
        if (q && q.unit != null && typeof q.unit !== "string") {
          gaps.push({
            field: `cost.quotes[${q.id || "?"}].unit`,
            reason: "malformed unit; preserved as unknown, not coerced",
            unit: q.unit,
          });
        }
      }
    }
  } catch (err) {
    stages.cost = { cap: "04", status: "failed", error: err.message };
    gaps.push({ field: "cost", reason: err.message });
  }

  // --- Cap05 fallback ---
  const hasFailedOutcome = isPlainObject(input.failedOutcome);
  const prereqKnown = prereq != null;
  const bindingKnown = binding != null;
  const prereqReady = prereq?.readiness === STAGE_SUCCESS.prerequisites;
  const evidenceBound = contentBoundOk(binding?.status);
  const needFallback =
    input.forceFallback === true ||
    hasFailedOutcome ||
    (prereqKnown && !prereqReady) ||
    (bindingKnown && !evidenceBound) ||
    stages.evidence?.status === "tampered_rejected";

  let fallback = null;
  if (needFallback) {
    if (!hasFailedOutcome && !demoMode) {
      stages.fallback = {
        cap: "05",
        status: "missing_failed_outcome",
        reason: {
          needed: true,
          missing: "failedOutcome",
          note: "Caller mode does not synthesize mutationState:none; missing failure evidence stays unknown.",
          prereqReadiness: prereq?.readiness ?? "unknown",
          evidenceStatus: binding?.status ?? stages.evidence?.status ?? "unknown",
        },
        factualAttempt: false,
        synthetic: false,
      };
      gaps.push({ field: "failedOutcome", reason: "missing_failed_outcome" });
    } else {
      const failedOutcome = hasFailedOutcome
        ? input.failedOutcome
        : {
            schema: "pilot.r2.capabilities.failure_outcome.v1",
            capabilityId: input.costInput?.capabilityId || "s180_capability",
            attemptId: envelope?.taskId || input.taskId || "s180-attempt",
            failureClass: "validation",
            mutationState: "none",
            observedState: {
              summary: "Demo synthetic fallback; not a factual attempt conclusion",
              verifyOk: false,
              reasons: gaps.map((g) => g.reason),
            },
            errorCode: "KIT_GAPS",
            notes: "Synthetic failed-outcome for Cap05 in explicit demo mode only",
            demo: true,
            factualAttempt: false,
          };
      try {
        fallback = buildFailureFallbackPlan(failedOutcome, { clock });
        stages.fallback = {
          cap: "05",
          status: fallback.status,
          reason: {
            needed: true,
            prereqReadiness: prereq?.readiness ?? "unknown",
            evidenceStatus: binding?.status ?? stages.evidence?.status ?? "unknown",
          },
          importPath: IMPORT_PATHS.cap05,
          report: fallback,
          synthetic: !hasFailedOutcome,
          factualAttempt: hasFailedOutcome,
          demo: !hasFailedOutcome || failedOutcome.demo === true,
          mutationState: fallback.mutationState ?? failedOutcome.mutationState ?? null,
          mutationPreservation: fallback.mutationPreservation ?? null,
        };
        if (fallback.status !== "ready") {
          gaps.push({
            field: "fallback.status",
            reason: fallback.status,
            missingInputs: missingInputIds(fallback),
          });
        }
      } catch (err) {
        stages.fallback = {
          cap: "05",
          status: "failed",
          error: err.message,
          reason: { needed: true },
        };
        gaps.push({ field: "fallback", reason: err.message });
      }
    }
  } else {
    const establishedReadyBound = prereqReady && evidenceBound;
    stages.fallback = {
      cap: "05",
      status: "skipped_not_needed",
      reason: {
        needed: false,
        prereqReadiness: prereq?.readiness ?? "unknown",
        evidenceStatus: binding?.status ?? stages.evidence?.status ?? "unknown",
        note: establishedReadyBound
          ? "Cap02 ready and Cap03 content_bound"
          : "Fallback not selected; missing prerequisites/evidence are unknown, not ready/content_bound",
      },
    };
  }

  // --- Cap06 composePartial ---
  let partial = null;
  const composeIn = input.compose ?? input.partial ?? null;
  if (!isPlainObject(composeIn) || !isPlainObject(composeIn.job) || !Array.isArray(composeIn.parts)) {
    stages.compose = {
      cap: "06",
      status: "unknown",
      note: "job/parts missing; composition unknown",
    };
    gaps.push({ field: "compose", reason: "missing job/parts" });
  } else {
    partial = composePartial({ job: composeIn.job, parts: composeIn.parts });
    stages.compose = {
      cap: "06",
      status: partial.status,
      holes: partial.holes,
      gaps: partial.gaps,
      importPath: IMPORT_PATHS.heavy,
      report: partial,
    };
    if (partial.status !== STAGE_SUCCESS.compose) {
      gaps.push({
        field: "compose.status",
        reason: partial.status,
        holes: partial.holes,
        partialMember: partial.holes?.[0] || partial.rejectedParts?.[0]?.id || null,
      });
    }
  }

  // --- Cap07 context pack ---
  let pack = null;
  try {
    pack = buildBuyerContextPack(input.buyerContext ?? input.buyerContextPack ?? null, { clock });
    stages.contextPack = {
      cap: "07",
      status: pack.status,
      dryRun: pack.dryRun === true,
      liveNetwork: pack.liveNetwork,
      importPath: IMPORT_PATHS.cap07,
      report: pack,
    };
    if (pack.status !== STAGE_SUCCESS.contextPack) {
      gaps.push({
        field: "contextPack.status",
        reason: pack.status,
        missingInputs: missingInputIds(pack),
      });
    }
  } catch (err) {
    stages.contextPack = { cap: "07", status: "failed", error: err.message };
    gaps.push({ field: "contextPack", reason: err.message });
  }

  // --- Cap08 walkthrough ---
  let walkthrough = null;
  try {
    walkthrough = await runInstallFirstResultWalkthrough(
      {
        taskId: input.taskId || envelope?.taskId || "s180-walkthrough",
        requirements: input.requirements ?? input.envelopeInput ?? null,
        costInput: input.costInput ?? null,
        artifact: input.artifact ?? null,
        discovery: input.discovery ?? { capabilityId: input.costInput?.capabilityId },
        prerequisites: input.walkthroughPrerequisites ?? {
          prerequisites: ["node22", "offline_fixtures", `heavy_pin:${HEAVY_PIN}`],
        },
        failedOutcome: input.failedOutcome,
      },
      { clock },
    );
    stages.walkthrough = {
      cap: "08",
      status: walkthrough.status,
      dryRun: walkthrough.dryRun === true,
      paidInstall: walkthrough.paidInstall,
      importPath: IMPORT_PATHS.cap08,
      verifyFailures: walkthroughVerifyFailures(walkthrough),
      report: walkthrough,
    };
    if (walkthrough.status !== STAGE_SUCCESS.walkthrough) {
      gaps.push({
        field: "walkthrough.status",
        reason: walkthrough.status,
        failures: walkthroughVerifyFailures(walkthrough),
      });
    }
  } catch (err) {
    stages.walkthrough = { cap: "08", status: "failed", error: err.message };
    gaps.push({ field: "walkthrough", reason: err.message });
  }

  const trust = classifyEvidenceTrust({
    advertised: input.advertised === true ? true : input.advertised === false ? false : null,
    binding,
    executionVerified: binding ? binding.executionVerified : null,
    accepted: false,
  });

  const assessments = {
    composedJob: {
      kind: "cap06_compose_partial",
      independentOf: "suppliedArtifact",
      status: partial?.status ?? stages.compose?.status ?? "unknown",
      holes: partial?.holes ?? null,
      note: "Cap06 job/parts composition is a separate assessment from Cap08 artifact verification.",
    },
    suppliedArtifact: {
      kind: "cap08_thin_verify",
      independentOf: "composedJob",
      status: walkthrough?.status ?? stages.walkthrough?.status ?? "unknown",
      failures: walkthroughVerifyFailures(walkthrough),
      note: "input.artifact is verified against Cap01 envelope constraints; not composed from compose.parts.",
    },
  };

  const status =
    gaps.length === 0 &&
    prereq?.readiness === STAGE_SUCCESS.prerequisites &&
    contentBoundOk(binding?.status) &&
    partial?.status === STAGE_SUCCESS.compose &&
    envelope?.status === STAGE_SUCCESS.envelope &&
    pack?.status === STAGE_SUCCESS.contextPack &&
    walkthrough?.status === STAGE_SUCCESS.walkthrough
      ? "utility_ok_not_release"
      : "integrated_partial";

  const report = {
    schema: SCHEMA,
    generatedAt,
    heavyPin: HEAVY_PIN,
    status,
    demo: demoMode,
    readyForRelease: false,
    accepted: false,
    paidCalls: false,
    liveNetwork: false,
    dryRun: true,
    mutationBoundary: MUTATION_BOUNDARY,
    stages,
    gaps,
    assessments,
    trust,
    localProbe: {
      invoked: localProbe.invoked,
      note: localProbe.note,
    },
    honestyNotes: [...HONESTY_NOTES],
    importPaths: { ...IMPORT_PATHS },
  };

  report.nextStep = buildNextStepManifest(report, {
    artifactRelPath: opts.artifactRelPath || "portable-out/last-journey.json",
    nextRunInputRelPath: opts.nextRunInputRelPath || null,
  });

  return scrubPortable(report, PORTABLE_OPTS);
}

function loadDemoOrNull(fx, name, callerMode, override) {
  if (override !== undefined) return override;
  if (callerMode) return null;
  const p = join(fx, name);
  if (!existsSync(p)) return null;
  return name.endsWith(".json") ? JSON.parse(readFileSync(p, "utf8")) : readFileSync(p, "utf8");
}

function cloneData(v) {
  if (v == null) return v;
  return JSON.parse(JSON.stringify(v));
}

function evidenceContent(ev) {
  return ev?.source?.content != null ? String(ev.source.content) : null;
}

function evidenceTap(ev) {
  return ev?.testOutput?.content != null ? String(ev.testOutput.content) : null;
}

/**
 * Cold-start Cap01→02→03→06. Default is an explicit fixture demo.
 * Caller mode (`opts.mode === "caller"`) does not inherit missing evidence from fixtures.
 */
export function runColdStart(opts = {}) {
  const clock = opts.clock || (() => Date.now());
  const fx = join(KIT_ROOT, "fixtures/cold-start");
  const callerMode = opts.mode === "caller" || opts.caller === true;
  const relDir = String(opts.outputRelDir || "portable-out").replace(/^\.\//, "").replace(/\/$/, "") || "portable-out";

  const requirements = loadDemoOrNull(fx, "caller-requirements.json", callerMode, opts.requirements);
  const manifest = loadDemoOrNull(fx, "caller-manifest-ready.json", callerMode, opts.manifest);
  const job = loadDemoOrNull(fx, "caller-job.json", callerMode, opts.job);
  const parts =
    opts.parts ??
    (callerMode
      ? null
      : [
          JSON.parse(readFileSync(join(fx, "caller-part-a.json"), "utf8")),
          JSON.parse(readFileSync(join(fx, "caller-part-c.json"), "utf8")),
        ]);
  const callerEvidence = isPlainObject(opts.evidence) ? opts.evidence : null;
  const sourceContent = callerEvidence
    ? opts.sourceContent !== undefined
      ? opts.sourceContent
      : evidenceContent(callerEvidence)
    : loadDemoOrNull(fx, "caller-source.mjs", callerMode, opts.sourceContent);
  const tapContent = callerEvidence
    ? opts.tapContent !== undefined
      ? opts.tapContent
      : evidenceTap(callerEvidence)
    : loadDemoOrNull(fx, "caller-tap-pass.txt", callerMode, opts.tapContent);
  const digest = sourceContent != null ? sha256Text(sourceContent) : null;
  const revision = opts.revision ?? (callerMode ? null : "s180-cold-start");

  const sourceConflict =
    callerEvidence &&
    opts.sourceContent !== undefined &&
    evidenceContent(callerEvidence) != null &&
    String(opts.sourceContent) !== evidenceContent(callerEvidence);
  const tapConflict =
    callerEvidence &&
    opts.tapContent !== undefined &&
    evidenceTap(callerEvidence) != null &&
    String(opts.tapContent) !== evidenceTap(callerEvidence);
  const evidenceConflict = Boolean(sourceConflict || tapConflict);

  const packageRoot = opts.packageRoot || (callerMode ? undefined : join(fx, "pkg"));
  const probeFlag = opts.probe === true;
  const localProbe = runLocalProbes({
    probe: probeFlag,
    manifest: manifest || {},
    packageRoot: packageRoot || KIT_ROOT,
  });
  const callerProbe = opts.probeData ??
    (!callerMode && existsSync(join(fx, "caller-probe-ready.json"))
      ? JSON.parse(readFileSync(join(fx, "caller-probe-ready.json"), "utf8"))
      : {});
  const probe = probeFlag ? buildProbeForResolve(localProbe, {}) : { ...callerProbe };

  const envelope = requirements
    ? buildTaskRequirementsEnvelope(requirements, { clock })
    : { status: "unknown", taskId: null };
  const prereq = isPlainObject(manifest)
    ? resolvePrerequisites({ manifest, probe })
    : { readiness: "unknown", gaps: [{ field: "manifest", reason: "missing" }] };

  let binding = {
    status: "unknown",
    executionVerified: false,
  };
  let normalizedEvidence = null;
  if (evidenceConflict) {
    binding = {
      status: "conflict_override",
      executionVerified: false,
      gaps: [
        {
          field: "evidence",
          reason: "opts.evidence bytes conflict with sourceContent/tapContent overrides; not silently selected",
        },
      ],
    };
  } else if (callerEvidence) {
    normalizedEvidence = cloneData(callerEvidence);
    try {
      binding = bindEvidence({
        ...normalizedEvidence,
        executionVerified: true,
      });
    } catch (err) {
      binding = { status: "failed", executionVerified: false, error: err.message };
    }
  } else if (sourceContent != null && digest != null) {
    normalizedEvidence = {
      declaration: {
        capabilityId: "R2-CAPABILITIES-03",
        revision,
        sourceSha256: digest,
      },
      source: { path: "caller-source.mjs", content: sourceContent, revision, sha256: digest },
      testOutput: { path: "caller-tap-pass.txt", content: tapContent, exitCode: 0 },
    };
    try {
      binding = bindEvidence({
        ...normalizedEvidence,
        executionVerified: true,
      });
    } catch (err) {
      binding = { status: "failed", executionVerified: false, error: err.message };
    }
  }

  const partial =
    isPlainObject(job) && Array.isArray(parts)
      ? composePartial({ job, parts })
      : { status: "unknown", payload: null, holes: [] };

  const ok =
    envelope.status === "ready" &&
    prereq.readiness === "ready" &&
    binding.status === "content_bound" &&
    binding.executionVerified === false &&
    partial.status === "complete";

  const artifact = scrubPortable({
    schema: "pilot.r2.capabilities.cold_start_artifact.v1",
    capabilityId: "s180-cold-start",
    summary: callerMode
      ? "Caller-mode Cap01→02→03→06 artifact"
      : "Demo cold-start Cap01→02→03→06 artifact from portable kit fixtures",
    heavyPin: HEAVY_PIN,
    generatedAt: new Date(clock()).toISOString(),
    mode: callerMode ? "caller" : "demo",
    demo: !callerMode,
    stages: {
      envelope: { status: envelope.status, taskId: envelope.taskId },
      prerequisites: { readiness: prereq.readiness, gaps: prereq.gaps },
      evidence: {
        status: binding.status,
        executionVerified: binding.executionVerified,
      },
      compose: { status: partial.status, payload: partial.payload },
    },
    firstUseStatus: ok ? "utility_ok_not_release" : "partial_first_use",
    readyForRelease: false,
    paidCalls: false,
    probeInvoked: localProbe.invoked,
    honestyNotes: [...HONESTY_NOTES],
  }, PORTABLE_OPTS);

  const nextRunInput = scrubPortable({
    schema: "pilot.r2.capabilities.next_run_input.v1",
    fromColdStart: true,
    mode: callerMode ? "caller" : "demo",
    demo: !callerMode,
    taskId: envelope.taskId,
    requirements,
    prerequisites: manifest ? { manifest, probe } : undefined,
    evidence: evidenceConflict ? undefined : cloneData(normalizedEvidence) || undefined,
    evidenceConflict: evidenceConflict
      ? {
          reason: "opts.evidence bytes conflict with sourceContent/tapContent overrides",
          evidenceSourceSha256: evidenceContent(callerEvidence)
            ? sha256Text(evidenceContent(callerEvidence))
            : null,
          overrideSourceSha256: opts.sourceContent != null ? sha256Text(String(opts.sourceContent)) : null,
        }
      : undefined,
    compose: job && parts ? { job, parts } : undefined,
    note: `Feed to \`capability-consumer-kit journey --input ${relDir}/next-run-input.json\`. Missing cost/context stay missing.`,
  }, PORTABLE_OPTS);

  const nextStep = buildNextStepManifest(
    {
      schema: SCHEMA,
      stages: {
        prerequisites: { readiness: prereq.readiness },
        evidence: { status: binding.status },
        compose: { status: partial.status, holes: partial.holes },
      },
      coldStartArtifactPath: `${relDir}/cold-start-artifact.json`,
    },
    {
      nextRunInputRelPath: `${relDir}/next-run-input.json`,
      artifactRelPath: `${relDir}/cold-start-artifact.json`,
    },
  );

  return {
    artifact,
    nextRunInput,
    nextStep,
    reports: { envelope, prereq, binding, partial },
  };
}

export { loadKitFixture, sha256Text, KIT_ROOT, STAGE_SUCCESS };
