import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { PACKET_STATUS, SCHEMA } from "./constants.mjs";
import { ERROR_CODES } from "./constants.mjs";
import { assertNoForbidden, isPlainObject, packetError } from "./validate.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const exchange01 = await import(pathToFileURL(join(__dirname, "../../01/src/index.mjs")).href);
const exchange03 = await import(pathToFileURL(join(__dirname, "../../03/src/index.mjs")).href);

/**
 * Assemble a neutral, source-linked disagreement packet.
 * Does NOT adjudicate, pick a winner, or apply payments.
 */
export function assembleDisputePacket(input, { clock = () => Date.now() } = {}) {
  if (!isPlainObject(input)) {
    throw packetError(ERROR_CODES.INVALID_INPUT, "input must be an object");
  }
  assertNoForbidden(input, "input");

  const brief = input.brief;
  const proposal = input.proposal ?? null;
  const artifact = input.artifact ?? null;
  const agreement = input.agreement ?? null;
  const requesterStatement = input.requesterStatement ?? null;
  const workerStatement = input.workerStatement ?? null;
  const sources = Array.isArray(input.sources) ? input.sources : [];

  if (!isPlainObject(brief) || !Array.isArray(brief.objectiveChecks)) {
    throw packetError(ERROR_CODES.INVALID_INPUT, "brief with objectiveChecks is required");
  }
  assertNoForbidden(brief, "brief");
  if (proposal) assertNoForbidden(proposal, "proposal");
  if (artifact) assertNoForbidden(artifact, "artifact");

  const revision = exchange03.briefRevisionFingerprint(brief);
  let check = null;
  let checkProvenance = null;
  if (artifact != null) {
    check = exchange01.runAcceptanceChecks(brief, artifact, { clock });
    checkProvenance = "runAcceptanceChecks";
  } else if (input.check) {
    check = input.check;
    checkProvenance = "imported_unverified";
  }

  const promisedCriteria = (brief.objectiveChecks || []).map((c) => ({
    id: c.id,
    class: "objective",
    description: c.description,
    check: c.check,
    source: "brief.objectiveChecks",
  }));
  for (const c of brief.subjectiveCriteria || []) {
    promisedCriteria.push({
      id: c.id,
      class: "subjective",
      description: c.description,
      status: c.status ?? "unresolved",
      source: "brief.subjectiveCriteria",
    });
  }

  const outputEvidence = [];
  if (check?.objective?.results) {
    for (const r of check.objective.results) {
      outputEvidence.push({
        criterionId: r.id,
        passed: r.passed,
        detail: r.detail,
        source: checkProvenance === "runAcceptanceChecks"
          ? "runAcceptanceChecks.objective.results"
          : "imported_unverified.objective.results",
      });
    }
  }
  if (artifact != null) {
    outputEvidence.push({
      kind: "artifact_snapshot",
      artifactRef: input.artifactRef ?? "artifact",
      keys: isPlainObject(artifact) ? Object.keys(artifact) : [],
      source: "supplied.artifact",
    });
  }

  const taskVersions = {
    briefRevisionSha256: revision.sha256,
    agreementBoundRevision: agreement?.boundRevision?.sha256 ?? null,
    agreementStatus: agreement?.status ?? null,
    proposalId: proposal?.id ?? null,
    sources: sources.map((s, i) => {
      if (!isPlainObject(s)) {
        throw packetError(ERROR_CODES.INVALID_INPUT, `sources[${i}] must be object`);
      }
      assertNoForbidden(s, `sources[${i}]`);
      return {
        id: s.id ?? `src_${i + 1}`,
        label: s.label ?? null,
        uri: s.uri ?? null,
        note: s.note ?? null,
      };
    }),
  };

  const missing = [];
  if (!proposal) missing.push("proposal");
  if (!artifact && !check) missing.push("artifact_or_check");
  if (!requesterStatement && !workerStatement) missing.push("party_statement");

  const status = missing.length ? PACKET_STATUS.INCOMPLETE : PACKET_STATUS.ASSEMBLED;

  const packet = {
    schema: SCHEMA,
    assembledAt: new Date(clock()).toISOString(),
    status,
    taskId: brief.taskId ?? null,
    adjudicationPolicy: {
      automaticDecision: false,
      declaresWinner: false,
      note: "Neutral packet only — no ruling emitted.",
    },
    taskVersions,
    promisedCriteria,
    suppliedOutputs: {
      proposal: proposal
        ? {
            id: proposal.id,
            proposerLabel: proposal.proposerLabel ?? null,
            terms: proposal.terms ?? {},
            claimedRequirements: proposal.claimedRequirements ?? [],
            source: "supplied.proposal",
          }
        : null,
      evidence: outputEvidence,
      checkSummary: check
        ? {
            objectivePassed: check.objective?.passed ?? null,
            objectiveFailed: check.objective?.failed ?? null,
            objectiveComplete: check.objective?.complete ?? null,
            subjectiveUnresolved: check.subjective?.unresolved ?? null,
            overallAccepted: check.overall?.accepted ?? false,
            source: checkProvenance,
          }
        : null,
    },
    statements: {
      requester: requesterStatement,
      worker: workerStatement,
    },
    disagreements: buildDisagreements(promisedCriteria, outputEvidence, requesterStatement, workerStatement),
    missingInputs: missing,
    note: "Neutral evidence packet only. No automatic adjudication, winner, refund, or ranking.",
    consumerInstructions: [
      "1. assembleDisputePacket({ brief, proposal?, artifact?, agreement?, statements?, sources? }).",
      "2. Read promisedCriteria vs suppliedOutputs and disagreements[] — linked to sources.",
      "3. adjudication is always null; do not treat this packet as a ruling.",
      "4. Human/operator decides next step outside this module.",
    ].join("\n"),
  };

  assertNoForbidden(packet, "packet");
  return packet;
}

function buildDisagreements(promisedCriteria, outputEvidence, requesterStatement, workerStatement) {
  const disagreements = [];
  const byId = new Map(
    outputEvidence.filter((e) => e.criterionId).map((e) => [e.criterionId, e]),
  );
  for (const c of promisedCriteria) {
    if (c.class !== "objective") continue;
    const ev = byId.get(c.id);
    if (!ev) {
      disagreements.push({
        criterionId: c.id,
        kind: "missing_output_evidence",
        promisedSource: c.source,
        outputSource: null,
      });
    } else if (ev.passed === false) {
      disagreements.push({
        criterionId: c.id,
        kind: "objective_failed",
        detail: ev.detail,
        promisedSource: c.source,
        outputSource: ev.source,
      });
    }
  }
  if (requesterStatement && workerStatement && requesterStatement !== workerStatement) {
    disagreements.push({
      kind: "conflicting_party_statements",
      promisedSource: "statements.requester",
      outputSource: "statements.worker",
    });
  }
  return disagreements;
}

export { exchange01, exchange03 };
