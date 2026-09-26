/**
 * DEMO-ONLY adapter: TownSquare kit/first-run → Exchange journey input.
 *
 * Loads exchange/01 and exchange/02 fixtures, may synthesize bound accept
 * (via withBoundAccept), and may clear subjective criteria for fixture modes.
 * Isolated from run/import. Real callers must use adapter/supplied-input.mjs.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PROVENANCE,
  S166_INTAKE_CONTRACT_REF,
} from "../src/labels.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const f01 = join(__dirname, "../exchange/01/fixtures");
const f02 = join(__dirname, "../exchange/02/fixtures");

export { PROVENANCE, S166_INTAKE_CONTRACT_REF };

export function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function sha256Json(value) {
  return createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

function fileSubmissionFor(artifact) {
  return {
    files: [
      {
        path: "artifact.json",
        byteLength: Buffer.byteLength(JSON.stringify(artifact ?? {}), "utf8"),
        format: "json",
      },
    ],
  };
}

/**
 * Overlay TownSquare scoped-task identity onto the bundled Exchange requirements fixture.
 * DEMO ONLY — never used by run/import.
 */
export function townsquareTaskToExchangeRequirements(
  townsquareResult,
  { clearSubjective = false } = {},
) {
  const provenance = PROVENANCE.FIXTURE_DEMO;
  const base = loadJson(join(f01, "requirements.positive.json"));
  const task = townsquareResult?.task || townsquareResult?.scopedTask || {};
  const taskId = task.id || townsquareResult?.scopedTaskId || base.taskId;
  const title = task.title || base.title;
  const summary =
    task.summary ||
    townsquareResult?.question?.text ||
    base.summary;

  return {
    ...base,
    taskId,
    title,
    summary,
    demo: true,
    sourceLabel: `townsquare:${provenance}`,
    provenance,
    subjectiveCriteria: clearSubjective ? [] : base.subjectiveCriteria || [],
    bounds: {
      ...(base.bounds || {}),
      notes:
        "DEMO ONLY. No custody, escrow, payment, or invented demand. Fixture criteria, not caller-supplied work.",
      townsquareCapabilityIds: Array.isArray(task.capabilityIds) ? task.capabilityIds : [],
      townsquareSourceCount: Array.isArray(task.sources) ? task.sources.length : 0,
      s166IntakeContractRef: S166_INTAKE_CONTRACT_REF,
    },
  };
}

export function loadPositiveArtifact() {
  return loadJson(join(f01, "artifact.positive.json"));
}

export function loadPartialArtifact() {
  return loadJson(join(f01, "artifact.partial.json"));
}

export function loadProposalBundle() {
  return loadJson(join(f02, "proposals.bundle.json"));
}

/**
 * Build Exchange journey input from a TownSquare result + bundled fixture delivery materials.
 * DEMO ONLY.
 */
export function adaptTownsquareToExchangeInput(
  townsquareResult,
  {
    clearSubjective = false,
    artifact = null,
    correctedArtifact = null,
    requesterDecision = undefined,
    allowWeakProposal = true,
  } = {},
) {
  const provenance = PROVENANCE.FIXTURE_DEMO;
  const requirements = townsquareTaskToExchangeRequirements(townsquareResult, {
    clearSubjective,
  });
  const proposals = loadProposalBundle().slice(0, 2);
  const workingArtifact = artifact ?? loadPositiveArtifact();

  const input = {
    requirements,
    proposals,
    chosenProposalId: proposals[0].id,
    artifact: workingArtifact,
    allowWeakProposal,
    provenance,
    townsquare: {
      scopedTaskId: requirements.taskId,
      packageId: townsquareResult?.packageId ?? null,
      demo: townsquareResult?.demo === true,
      contradictionPreserved:
        townsquareResult?.task?.contradictionPreserved ??
        townsquareResult?.correctedAnswer?.contradictionPreserved ??
        null,
    },
    fileSubmission: fileSubmissionFor(workingArtifact),
  };

  if (correctedArtifact !== undefined && correctedArtifact !== null) {
    input.correctedArtifact = correctedArtifact;
    input.correctedFileSubmission = fileSubmissionFor(correctedArtifact);
  }
  if (requesterDecision !== undefined) {
    input.requesterDecision = requesterDecision;
  }
  return input;
}

/** DEMO helper: synthesize requester accept bound to probe revision. Not used by run/import. */
export function withBoundAccept(input, probeResult) {
  const artifact = input.correctedArtifact ?? input.artifact;
  return {
    ...input,
    requesterDecision: {
      decision: "accept",
      artifactSha256: sha256Json(artifact),
      revisionSha256: probeResult.boundRevisionSha256,
    },
  };
}
