#!/usr/bin/env node
/**
 * Portable CLI for the S02 work/bounty board fixtures.
 *
 * Usage:
 *   node cli.mjs list
 *   node cli.mjs show <jobId>
 *   node cli.mjs export
 *   node cli.mjs journey-demo
 *   node cli.mjs adversarial
 *   node cli.mjs create [jobId]
 *   node cli.mjs create-update-observe
 *   node cli.mjs observe [jobId]
 *   node cli.mjs service-journey --base-url http://127.0.0.1:PORT --admin-token TOKEN
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createWorkBoard,
  createPortableFixturePacket,
  demonstrationCreateJobInput,
  FUNDING_CLASS,
  runWorkBoardJourney,
} from "./index.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function loadBoardFromFixture() {
  const seedPath = join(root, "fixtures", "board.seed.json");
  const seed = JSON.parse(readFileSync(seedPath, "utf8"));
  return createWorkBoard({ seed: seed.board || seed });
}

function cmdList() {
  const board = loadBoardFromFixture();
  print({
    disclaimer: board.getDisclaimer(),
    jobs: board.listJobs().map((job) => ({
      id: job.id,
      title: job.title,
      fundingClass: job.fundingClass,
      status: job.status,
      version: job.version,
      externalLink: job.externalLink,
    })),
  });
}

function cmdShow(jobId) {
  const board = loadBoardFromFixture();
  print(board.getJobDossier(jobId));
}

function cmdExport(outPath) {
  const packet = createPortableFixturePacket();
  const target = outPath || join(root, "fixtures", "portable-export.json");
  writeFileSync(target, `${JSON.stringify(packet, null, 2)}\n`);
  print({ written: target, schema: packet.schema, jobs: packet.board.jobs.length });
}

function cmdJourneyDemo() {
  const board = createWorkBoard();
  const jobId = "job_demo_page_diff";
  const job = board.getJob(jobId);
  const proposal = board.submitProposal({
    jobId,
    agentId: "agent_alpha",
    summary: "Will produce a bounded docs-diff note for the demonstration job.",
    expectedVersion: job.version,
    idempotencyKey: "demo-propose-1",
  });
  const completion = board.submitCompletion({
    jobId,
    agentId: "agent_alpha",
    proposalId: proposal.proposal.id,
    artifact: {
      url: "https://neomorphic.io/api/receipts/lab-release-2026-09-01.json",
      label: "demonstration completion artifact (reference)",
      digest: "sha256:demo",
    },
    evidenceNotes: ["changed=false for demonstration", "fundingClass=demonstration"],
    expectedVersion: proposal.job.version,
    idempotencyKey: "demo-complete-1",
  });
  const correction = board.submitCorrection({
    jobId,
    agentId: "agent_alpha",
    correctsCompletionId: completion.completion.id,
    text: "CORRECTION: prior note overstated certainty; treat as demonstration only.",
    expectedVersion: completion.job.version,
    idempotencyKey: "demo-correct-1",
  });
  print({
    fundingClass: FUNDING_CLASS.demonstration,
    proposal: proposal.proposal,
    completion: completion.completion,
    correction: correction.correction,
    events: board.listEvents({ jobId }),
    handoff: board.getHandoff(),
  });
}

function parseFlags(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) out[key] = true;
      else {
        out[key] = next;
        i += 1;
      }
    } else out._.push(a);
  }
  return out;
}

function cmdCreate(jobId) {
  const board = createWorkBoard();
  const created = board.createJob(
    demonstrationCreateJobInput({
      id: jobId || `job_demo_created_${Date.now()}`,
      idempotencyKey: "cli-create-1",
    }),
  );
  print({
    created: created.job,
    event: created.event,
    observed: board.listEvents({ jobId: created.job.id }),
  });
}

function cmdObserve(jobId) {
  const board = loadBoardFromFixture();
  print({
    jobId: jobId || null,
    events: board.listEvents(jobId ? { jobId } : {}),
    note: "Seed fixtures start with an empty ledger. Use create-update-observe to create, update, and observe in one process.",
  });
}

async function cmdCreateUpdateObserve() {
  const result = await runWorkBoardJourney();
  print(result);
}

async function cmdServiceJourney(flags) {
  const result = await runWorkBoardJourney({
    baseUrl: flags["base-url"] || null,
    adminToken: flags["admin-token"] || null,
  });
  print(result);
}

function cmdAdversarial() {
  const board = createWorkBoard();
  const jobId = "job_demo_receipt_check";
  let job = board.getJob(jobId);

  const a = board.submitProposal({
    jobId,
    agentId: "agent_a",
    summary: "Agent A proposal",
    expectedVersion: job.version,
    idempotencyKey: "a-propose",
  });
  const b = board.submitProposal({
    jobId,
    agentId: "agent_b",
    summary: "Agent B competing proposal",
    expectedVersion: a.job.version,
    idempotencyKey: "b-propose",
  });

  let staleError = null;
  try {
    board.submitProposal({
      jobId,
      agentId: "agent_stale",
      summary: "Stale based on version 1",
      expectedVersion: 1,
      idempotencyKey: "stale-propose",
    });
  } catch (error) {
    staleError = { code: error.code, message: error.message };
  }

  let missingError = null;
  try {
    board.submitCompletion({
      jobId,
      agentId: "agent_a",
      proposalId: a.proposal.id,
      artifact: null,
      evidenceNotes: [],
      expectedVersion: b.job.version,
      idempotencyKey: "missing-art",
    });
  } catch (error) {
    missingError = { code: error.code, message: error.message };
  }

  const doneA = board.submitCompletion({
    jobId,
    agentId: "agent_a",
    proposalId: a.proposal.id,
    artifact: {
      url: "https://neomorphic.io/api/receipts/lab-release-2026-09-01.json",
      label: "agent A artifact",
    },
    evidenceNotes: ["receipt shape checked"],
    expectedVersion: b.job.version,
    idempotencyKey: "a-complete",
  });

  const replay = board.submitCompletion({
    jobId,
    agentId: "agent_a",
    proposalId: a.proposal.id,
    artifact: {
      url: "https://neomorphic.io/api/receipts/lab-release-2026-09-01.json",
      label: "agent A artifact",
    },
    evidenceNotes: ["receipt shape checked"],
    expectedVersion: b.job.version,
    idempotencyKey: "a-complete",
  });

  let conflictError = null;
  try {
    board.submitCompletion({
      jobId,
      agentId: "agent_b",
      proposalId: b.proposal.id,
      artifact: {
        url: "https://neomorphic.io/api/receipts/lab-release-2026-09-01.json",
        label: "agent B late artifact",
      },
      evidenceNotes: ["should conflict"],
      expectedVersion: doneA.job.version,
      idempotencyKey: "b-complete",
    });
  } catch (error) {
    conflictError = { code: error.code, message: error.message };
  }

  print({
    competingProposals: { a: a.proposal.id, b: b.proposal.id, bSawCompeting: b.proposal.competingProposalIds },
    staleError,
    missingError,
    completionId: doneA.completion.id,
    dedupedReplaySameId: replay.completion.id === doneA.completion.id,
    conflictError,
  });
}

const flags = parseFlags(process.argv.slice(2));
const cmd = flags._[0];
const arg = flags._[1];
const commands = {
  list: () => cmdList(),
  show: () => {
    if (!arg) throw new Error("show requires <jobId>");
    cmdShow(arg);
  },
  export: () => cmdExport(arg),
  "journey-demo": () => cmdJourneyDemo(),
  adversarial: () => cmdAdversarial(),
  create: () => cmdCreate(arg),
  observe: () => cmdObserve(arg),
  "create-update-observe": () => cmdCreateUpdateObserve(),
  "service-journey": () => cmdServiceJourney(flags),
};

if (!cmd || !commands[cmd]) {
  process.stderr.write(
    "Usage: node cli.mjs <list|show|export|journey-demo|adversarial|create|observe|create-update-observe|service-journey> [arg]\n",
  );
  process.exit(2);
}

try {
  const result = commands[cmd]();
  if (result && typeof result.then === "function") {
    await result;
  }
} catch (error) {
  print({ error: { code: error.code || "failed", message: error.message } });
  process.exit(1);
}
