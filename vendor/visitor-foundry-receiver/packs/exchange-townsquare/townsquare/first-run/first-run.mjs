#!/usr/bin/env node
/**
 * Machine first-run: question → verified artifact → corrected answer
 * Uses the S170 kit pipeline (literal CLI sibling). No paid invoke / invented traffic.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runConversationToTask } from "../kit/src/pipeline.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = __dirname;

function load(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

export function runFirstUse(conversationPath = join(root, "fixtures/first-conversation.json")) {
  const input = load(conversationPath);
  if (input.demo !== true) {
    const err = new Error("first-run requires demo:true");
    err.code = "synthetic_only";
    throw err;
  }
  const kit = runConversationToTask(input, { now: "2026-09-10T12:47:00.000Z" });
  const verifiedArtifact = {
    cards: kit.task.sources,
    capabilityIds: kit.task.capabilityIds,
  };
  const correctedAnswer = {
    preservedCorrections: kit.task.writeControls?.preservedCorrections || [],
    contradictionPreserved: kit.task.contradictionPreserved === true,
    proposedActions: kit.task.proposedActions,
  };
  return {
    schema: "neomorphic.r2.townsquare.first_run.v1",
    packageId: "R2-TOWNSQUARE-FIRST-RUN-S172",
    kitTipOwned: "8760ee4dc4b65641dafa7067bd0e153cafdd71c8",
    demo: true,
    fabricatedUsers: false,
    inventedTraffic: false,
    paidInvoke: false,
    execute: false,
    question: input.question,
    verifiedArtifact,
    correctedAnswer,
    scopedTaskId: kit.task.id,
    stages: kit.stages,
    consumerInstructions:
      "node experiments/scale-r2-20260910/townsquare/first-run/first-run.mjs   OR   node first-run.mjs after cd to this dir. Uses ../kit pipeline.",
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  try {
    const out = runFirstUse(process.argv[2] || join(root, "fixtures/first-conversation.json"));
    mkdirSync(join(root, "out"), { recursive: true });
    writeFileSync(join(root, "out/first-run.json"), JSON.stringify(out, null, 2));
    console.log(
      JSON.stringify(
        {
          status: "ready",
          packageId: out.packageId,
          scopedTaskId: out.scopedTaskId,
          capabilityIds: out.verifiedArtifact.capabilityIds,
          correctedAnswerPreserved: out.correctedAnswer.contradictionPreserved,
          fabricatedUsers: out.fabricatedUsers,
          paidInvoke: out.paidInvoke,
          execute: out.execute,
          wrote: "out/first-run.json",
        },
        null,
        2,
      ),
    );
  } catch (e) {
    console.error(JSON.stringify({ error: e.code || "error", message: e.message }));
    process.exit(1);
  }
}
