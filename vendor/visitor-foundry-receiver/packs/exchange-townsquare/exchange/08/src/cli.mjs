#!/usr/bin/env node
/**
 * Fresh-consumer CLI (S151 amend + S152/S155).
 *
 *   node src/cli.mjs demo
 *   node src/cli.mjs demo-gate
 *   node src/cli.mjs demo-correct
 *   node src/cli.mjs preflight
 *   node src/cli.mjs run <input.json> [--receipt <out.json>]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runRequesterDeliveryJourney } from "./journey.mjs";
import { runRequestToCorrectionJourney } from "./correction-journey.mjs";
import { buildJourneyReceipt } from "./receipt.mjs";
import { preflightExchangePackageSync } from "../../acquisition.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const f01 = join(__dirname, "../../01/fixtures");
const f02 = join(__dirname, "../../02/fixtures");
const load = (p) => JSON.parse(readFileSync(p, "utf8"));

function artifactSha(artifact) {
  return createHash("sha256").update(JSON.stringify(artifact ?? null)).digest("hex");
}

function summarize(out) {
  return {
    integrated: out.integrated,
    ok: out.ok,
    gated: out.gated,
    outcome: out.outcome,
    outcomeReason: out.outcomeReason,
    acceptanceKind: out.acceptanceKind ?? null,
    selectedProposalId: out.selectedProposalId ?? null,
    proposalId: out.proposalId ?? null,
    gate: out.gate,
    checks: out.checks ?? null,
    admission: out.admission ?? null,
    acquisitionStep: out.steps?.find((s) => s.step === "package_acquisition") || null,
    composedModules: out.composedModules,
    steps: out.steps.map((s) => ({
      step: s.step,
      status: s.status ?? s.decision ?? s.outcome ?? null,
      reason: s.reason ?? null,
    })),
    agreementObjectiveComplete: out.agreement?.objectiveComplete ?? null,
    correction: out.correction,
    lifecycle: out.lifecycle,
    boundArtifactSha256: out.boundArtifactSha256 ?? null,
    ranking: out.comparison?.ranking ?? null,
  };
}

function exitFrom(out) {
  if (out.gated) process.exit(2);
  if (!out.ok) process.exit(1);
  process.exit(0);
}

const cmd = process.argv[2];
const allowed = ["demo", "demo-gate", "demo-correct", "preflight", "run"];
if (!allowed.includes(cmd)) {
  console.error(`Usage:
  node src/cli.mjs preflight
  node src/cli.mjs demo
  node src/cli.mjs demo-gate
  node src/cli.mjs demo-correct
  node src/cli.mjs run <input.json> [--receipt <out.json>] [--clock <iso>]`);
  process.exit(2);
}

if (cmd === "preflight") {
  const acq = preflightExchangePackageSync();
  console.log(JSON.stringify(acq, null, 2));
  process.exit(acq.ok ? 0 : 2);
}

if (cmd === "demo-correct") {
  const out = runRequestToCorrectionJourney(
    {
      requirements: load(join(f01, "requirements.positive.json")),
      artifact: load(join(f01, "artifact.partial.json")),
      correctedArtifact: load(join(f01, "artifact.positive.json")),
    },
    { clock: () => Date.parse("2026-09-10T19:00:00.000Z") },
  );
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 1);
}

if (cmd === "run") {
  const inputPath = process.argv[3];
  if (!inputPath) {
    console.error("run requires <input.json>");
    process.exit(2);
  }
  let receiptPath = null;
  for (let i = 4; i < process.argv.length; i += 1) {
    if (process.argv[i] === "--receipt") {
      receiptPath = process.argv[i + 1];
      i += 1;
    }
  }
  const input = load(resolve(inputPath));
  let clockMs = Date.now();
  for (let i = 4; i < process.argv.length; i += 1) {
    if (process.argv[i] === "--clock" && process.argv[i + 1]) {
      clockMs = Date.parse(process.argv[i + 1]);
      i += 1;
    }
  }
  const clock = () => clockMs;
  const out = runRequesterDeliveryJourney(input, { clock });
  const receipt = buildJourneyReceipt(input, out, { clock });
  console.log(JSON.stringify({ journey: summarize(out), receipt }, null, 2));
  if (receiptPath) {
    writeFileSync(resolve(receiptPath), `${JSON.stringify(receipt, null, 2)}\n`);
  }
  exitFrom(out);
}

const requirements = load(join(f01, "requirements.positive.json"));
const proposals = load(join(f02, "proposals.bundle.json")).slice(0, 2);
const partial = load(join(f01, "artifact.partial.json"));
const fixed = load(join(f01, "artifact.positive.json"));

const input =
  cmd === "demo-gate"
    ? {
        requirements,
        proposals,
        chosenProposalId: proposals[0].id,
        artifact: fixed,
        allowWeakProposal: true,
        fileSubmission: {
          files: [
            { path: "../secret.json", byteLength: 10, format: "json" },
            { path: "artifact.json", byteLength: 10, format: "json" },
          ],
        },
      }
    : {
        requirements,
        proposals,
        chosenProposalId: proposals[0].id,
        artifact: partial,
        correctedArtifact: fixed,
        allowWeakProposal: true,
        fileSubmission: {
          files: [{ path: "artifact.json", byteLength: JSON.stringify(partial).length, format: "json" }],
        },
        correctedFileSubmission: {
          files: [{ path: "artifact.json", byteLength: JSON.stringify(fixed).length, format: "json" }],
        },
      };

const demoClock = () => Date.parse("2026-09-10T18:00:00.000Z");
let demoInput = input;
if (cmd === "demo") {
  const probe = runRequesterDeliveryJourney(
    { ...input, requesterDecision: undefined },
    { clock: demoClock },
  );
  demoInput = {
    ...input,
    requesterDecision: {
      decision: "accept",
      artifactSha256: artifactSha(fixed),
      revisionSha256: probe.boundRevisionSha256,
    },
  };
}
const out = runRequesterDeliveryJourney(demoInput, { clock: demoClock });

console.log(JSON.stringify(summarize(out), null, 2));
exitFrom(out);
