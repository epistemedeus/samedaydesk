/**
 * BOT-S172/S173 Cap first-run against S164 Heavy pin.
 * caller input → Cap01 envelope → Cap02 prereq (runtime/filesystem probe) →
 * Cap03 bindEvidence (content_bound; executionVerified always false) →
 * Cap06 composePartial (complete parts only; trim schema/scope).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTaskRequirementsEnvelope } from "../../01/src/index.mjs";
import {
  resolvePrerequisites,
  bindEvidence,
  composePartial,
} from "../../../s138-capability-evidence/src/index.mjs";
import { HEAVY_PIN, MUTATION_BOUNDARY, SCHEMA } from "./constants.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fx = join(__dirname, "../fixtures");
const sha = (s) => createHash("sha256").update(s).digest("hex");

function loadJson(name) {
  return JSON.parse(readFileSync(join(fx, name), "utf8"));
}
function loadText(name) {
  return readFileSync(join(fx, name), "utf8");
}

export function runFirstUse(opts = {}) {
  const clock = opts.clock || (() => Date.now());
  const generatedAt = new Date(clock()).toISOString();

  const requirements = opts.requirements ?? loadJson("caller-requirements.json");
  const manifest = opts.manifest ?? loadJson("caller-manifest-ready.json");
  const probe = opts.probe ?? loadJson("caller-probe-ready.json");
  const job = opts.job ?? loadJson("caller-job.json");
  const parts = opts.parts ?? [loadJson("caller-part-a.json"), loadJson("caller-part-c.json")];

  const sourceContent = opts.sourceContent ?? loadText("caller-source.mjs");
  const tapContent = opts.tapContent ?? loadText("caller-tap-pass.txt");
  const digest = sha(sourceContent);
  const revision = opts.revision ?? "s172-local";

  const envelope = buildTaskRequirementsEnvelope(requirements, { clock });

  // Cap02: readiness requires true boolean runtime/filesystem probes
  const prereq = resolvePrerequisites({ manifest, probe });

  // Cap03: content_bound only; executionVerified always false from library
  const binding = bindEvidence({
    declaration: {
      capabilityId: "R2-CAPABILITIES-03",
      revision,
      sourceSha256: digest,
    },
    source: {
      path: "caller-source.mjs",
      content: sourceContent,
      revision,
      sha256: digest,
    },
    testOutput: {
      path: "caller-tap-pass.txt",
      content: tapContent,
      exitCode: 0,
    },
    // Ignored if true — library must keep executionVerified false
    executionVerified: true,
  });

  // Cap06: only explicit complete parts; job schema/scope trimmed by Heavy
  const partial = composePartial({ job, parts });

  const prereqReady = prereq?.readiness === "ready";
  const contentBound = binding?.status === "content_bound";
  const execFalse = binding?.executionVerified === false;
  const partialComplete = partial?.status === "complete";

  let firstUseStatus = "blocked";
  if (envelope.status === "ready" && prereqReady && contentBound && execFalse && partialComplete) {
    firstUseStatus = "utility_ok_not_release";
  } else if (envelope.status === "ready") {
    firstUseStatus = "partial_first_use";
  }

  return {
    schema: SCHEMA,
    generatedAt,
    heavyPin: HEAVY_PIN,
    s164Head: "8a6716482b2f240078f7b17a3cf5547f1d122302",
    stages: {
      envelope: { status: envelope.status, taskId: envelope.taskId },
      prerequisites: {
        readiness: prereq?.readiness ?? "unknown",
        gaps: prereq?.gaps ?? [],
        report: prereq,
      },
      evidence: {
        status: binding?.status ?? "unknown",
        executionVerified: binding?.executionVerified ?? false,
        report: binding,
      },
      partialResult: {
        status: partial?.status ?? "unknown",
        gaps: partial?.gaps ?? [],
        report: partial,
      },
    },
    honesty: {
      executionVerified: false,
      contentBoundMeansBytesAndTapShapeOnly: true,
      tapDoesNotProveExecution: true,
      readinessRequiresBooleanRuntimeOrFilesystemProbe: true,
      composeRequiresExplicitComplete: true,
      paidInvoke: false,
      inventedTraffic: false,
      s164SourceRewrite: false,
    },
    firstUseStatus,
    accepted: false,
    readyForRelease: false,
    mutationBoundary: MUTATION_BOUNDARY,
  };
}

export function runCatalogOnlyFirstUse(opts = {}) {
  return runFirstUse({
    ...opts,
    manifest: opts.manifest ?? loadJson("caller-manifest-catalog-only.json"),
    probe: opts.probe ?? {},
  });
}
