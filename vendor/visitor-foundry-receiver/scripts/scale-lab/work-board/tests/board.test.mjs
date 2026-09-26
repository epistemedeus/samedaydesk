import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createPortableFixturePacket,
  createSeedBoard,
  createWorkBoard,
  ERROR_CODES,
  EVENT_KINDS,
  FIXTURE_LABEL,
  FUNDING_CLASS,
  SCHEMA,
} from "../src/index.mjs";
import { bindWorkBoard } from "../ui/work-board-ui.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("seed board labels demonstrations and distinguishes external links", () => {
  const seed = createSeedBoard();
  assert.equal(seed.schema, SCHEMA);
  assert.equal(seed.label, FIXTURE_LABEL);
  assert.match(seed.disclaimer, /unfunded/i);
  const demos = seed.jobs.filter((j) => j.fundingClass === FUNDING_CLASS.demonstration);
  const externals = seed.jobs.filter((j) => j.fundingClass === FUNDING_CLASS.external);
  assert.ok(demos.length >= 2);
  assert.ok(externals.length >= 1);
  assert.ok(demos.every((j) => /demonstrat/i.test(`${j.title} ${j.brief} ${j.label}`)));
  assert.ok(externals.every((j) => j.externalLink?.startsWith("https://")));
  assert.ok(demos.every((j) => Array.isArray(j.acceptanceEvidence) && j.acceptanceEvidence.length >= 1));
  assert.ok(demos.every((j) => j.deliverableContract.length > 20));
});

test("portable fixture packet and on-disk seed share schema", () => {
  const packet = createPortableFixturePacket();
  assert.equal(packet.schema, SCHEMA);
  assert.equal(packet.kind, "work-board-fixture-packet");
  const disk = JSON.parse(readFileSync(join(root, "fixtures/board.seed.json"), "utf8"));
  assert.equal(disk.schema, SCHEMA);
  assert.equal(disk.board.jobs.length, packet.board.jobs.length);
});

test("happy path: proposal → artifact completion → correction maps to correspondence kinds", () => {
  const board = createWorkBoard();
  const jobId = "job_demo_page_diff";
  const job = board.getJob(jobId);
  const proposal = board.submitProposal({
    jobId,
    agentId: "agent_alpha",
    summary: "Bounded docs-diff proposal",
    expectedVersion: job.version,
    idempotencyKey: "k-propose",
  });
  assert.equal(proposal.event.kind, EVENT_KINDS.request);
  assert.equal(proposal.job.version, 2);

  const completion = board.submitCompletion({
    jobId,
    agentId: "agent_alpha",
    proposalId: proposal.proposal.id,
    artifact: {
      url: "https://neomorphic.io/api/receipts/lab-release-2026-09-01.json",
      label: "demo artifact",
    },
    evidenceNotes: ["demonstration only"],
    expectedVersion: proposal.job.version,
    idempotencyKey: "k-complete",
  });
  assert.equal(completion.event.kind, EVENT_KINDS.artifact);
  assert.equal(completion.completion.status, "accepted");

  const correction = board.submitCorrection({
    jobId,
    agentId: "agent_alpha",
    correctsCompletionId: completion.completion.id,
    text: "Prior note overstated certainty.",
    expectedVersion: completion.job.version,
    idempotencyKey: "k-correct",
  });
  assert.equal(correction.event.kind, EVENT_KINDS.correction);
  assert.equal(correction.correction.supersedesCompletionId, completion.completion.id);
  const dossier = board.getJobDossier(jobId);
  assert.equal(dossier.completions[0].status, "superseded");
  assert.equal(dossier.job.status, "corrected");
});

test("two agents: competing proposals, stale rejection, missing artifact, retry dedupe, conflict", () => {
  const board = createWorkBoard();
  const jobId = "job_demo_receipt_check";
  const v1 = board.getJob(jobId).version;

  const a = board.submitProposal({
    jobId,
    agentId: "agent_a",
    summary: "A",
    expectedVersion: v1,
    idempotencyKey: "a-p",
  });
  const b = board.submitProposal({
    jobId,
    agentId: "agent_b",
    summary: "B competing",
    expectedVersion: a.job.version,
    idempotencyKey: "b-p",
  });
  assert.ok(b.proposal.competingProposalIds.includes(a.proposal.id));
  assert.equal(b.competingCount, 1);

  assert.throws(
    () =>
      board.submitProposal({
        jobId,
        agentId: "agent_stale",
        summary: "stale",
        expectedVersion: v1,
        idempotencyKey: "stale",
      }),
    (error) => error.code === ERROR_CODES.stale_version,
  );

  assert.throws(
    () =>
      board.submitCompletion({
        jobId,
        agentId: "agent_a",
        proposalId: a.proposal.id,
        artifact: null,
        evidenceNotes: [],
        expectedVersion: b.job.version,
        idempotencyKey: "missing",
      }),
    (error) => error.code === ERROR_CODES.missing_artifact,
  );

  assert.throws(
    () =>
      board.submitCompletion({
        jobId,
        agentId: "agent_a",
        proposalId: a.proposal.id,
        artifact: { url: "http://insecure.example/x" },
        evidenceNotes: [],
        expectedVersion: b.job.version,
        idempotencyKey: "bad-url",
      }),
    (error) => error.code === ERROR_CODES.invalid_artifact,
  );

  const done = board.submitCompletion({
    jobId,
    agentId: "agent_a",
    proposalId: a.proposal.id,
    artifact: {
      url: "https://neomorphic.io/api/receipts/lab-release-2026-09-01.json",
      label: "A artifact",
    },
    evidenceNotes: ["ok"],
    expectedVersion: b.job.version,
    idempotencyKey: "a-c",
  });

  const replay = board.submitCompletion({
    jobId,
    agentId: "agent_a",
    proposalId: a.proposal.id,
    artifact: {
      url: "https://neomorphic.io/api/receipts/lab-release-2026-09-01.json",
      label: "A artifact",
    },
    evidenceNotes: ["ok"],
    expectedVersion: b.job.version,
    idempotencyKey: "a-c",
  });
  assert.equal(replay.completion.id, done.completion.id);

  assert.throws(
    () =>
      board.submitCompletion({
        jobId,
        agentId: "agent_a",
        proposalId: a.proposal.id,
        artifact: {
          url: "https://neomorphic.io/api/receipts/lab-release-2026-09-01.json",
          label: "different body",
        },
        evidenceNotes: ["changed"],
        expectedVersion: b.job.version,
        idempotencyKey: "a-c",
      }),
    (error) => error.code === ERROR_CODES.conflict,
  );

  assert.throws(
    () =>
      board.submitCompletion({
        jobId,
        agentId: "agent_b",
        proposalId: b.proposal.id,
        artifact: {
          url: "https://neomorphic.io/api/receipts/lab-release-2026-09-01.json",
          label: "B late",
        },
        evidenceNotes: ["conflict"],
        expectedVersion: done.job.version,
        idempotencyKey: "b-c",
      }),
    (error) => error.code === ERROR_CODES.conflict,
  );

  const rejectedB = board.getJobDossier(jobId).proposals.find((p) => p.id === b.proposal.id);
  assert.equal(rejectedB.status, "rejected");
});

test("createJob adds a labelled demonstration row and is observable", () => {
  const seed = createSeedBoard();
  seed.jobs = [];
  seed.events = [];
  const board = createWorkBoard({ seed });
  const created = board.createJob({
    id: "job_created_demo",
    title: "DEMONSTRATION: created row",
    brief: "Demonstration only (unfunded). Create then observe.",
    deliverableContract: "Return a JSON note. No escrow.",
    acceptanceEvidence: ["labelled demonstration", "observable ledger event"],
    fundingClass: FUNDING_CLASS.demonstration,
    label: "demonstration · unfunded · fictional",
    idempotencyKey: "create-1",
  });
  assert.equal(created.job.status, "open");
  assert.equal(created.job.version, 1);
  assert.equal(created.event.kind, EVENT_KINDS.request);
  assert.equal(board.listJobs().length, 1);
  assert.equal(board.listEvents({ jobId: "job_created_demo" }).length, 1);

  const replay = board.createJob({
    id: "job_created_demo",
    title: "DEMONSTRATION: created row",
    brief: "Demonstration only (unfunded). Create then observe.",
    deliverableContract: "Return a JSON note. No escrow.",
    acceptanceEvidence: ["labelled demonstration", "observable ledger event"],
    fundingClass: FUNDING_CLASS.demonstration,
    label: "demonstration · unfunded · fictional",
    idempotencyKey: "create-1",
  });
  assert.equal(replay.job.id, created.job.id);
  assert.equal(board.listJobs().length, 1);

  assert.throws(
    () =>
      board.createJob({
        id: "job_created_demo",
        title: "DEMONSTRATION: other body",
        brief: "Demonstration only (unfunded). Different body.",
        deliverableContract: "Return a JSON note. No escrow.",
        acceptanceEvidence: ["labelled demonstration"],
        fundingClass: FUNDING_CLASS.demonstration,
        label: "demonstration · unfunded · fictional",
        idempotencyKey: "create-1",
      }),
    (error) => error.code === ERROR_CODES.conflict,
  );

  assert.throws(
    () =>
      board.createJob({
        id: "job_unlabelled",
        title: "Plain row",
        brief: "No honesty marker in title, brief, or label field.",
        deliverableContract: "Return a JSON note.",
        acceptanceEvidence: ["something"],
        fundingClass: FUNDING_CLASS.demonstration,
        idempotencyKey: "create-unlabelled",
      }),
    (error) => error.code === ERROR_CODES.invalid_input,
  );
});

test("create then proposal/completion/correction is observable on the local ledger", () => {
  const board = createWorkBoard();
  const created = board.createJob({
    id: "job_created_update",
    title: "DEMONSTRATION: update after create",
    brief: "Demonstration only (unfunded).",
    deliverableContract: "JSON note. No escrow.",
    acceptanceEvidence: ["observable kinds"],
    fundingClass: FUNDING_CLASS.demonstration,
    label: "demonstration · unfunded · fictional",
    idempotencyKey: "cu-create",
  });
  const proposal = board.submitProposal({
    jobId: created.job.id,
    agentId: "agent_n12",
    summary: "Will produce the demonstration note.",
    expectedVersion: created.job.version,
    idempotencyKey: "cu-propose",
  });
  const completion = board.submitCompletion({
    jobId: created.job.id,
    agentId: "agent_n12",
    proposalId: proposal.proposal.id,
    artifact: {
      url: "https://neomorphic.io/api/receipts/lab-release-2026-09-01.json",
      label: "created-job artifact",
    },
    evidenceNotes: ["demonstration only"],
    expectedVersion: proposal.job.version,
    idempotencyKey: "cu-complete",
  });
  board.submitCorrection({
    jobId: created.job.id,
    agentId: "agent_n12",
    correctsCompletionId: completion.completion.id,
    text: "Correction retained as data.",
    expectedVersion: completion.job.version,
    idempotencyKey: "cu-correct",
  });
  const observed = board.listEvents({ jobId: created.job.id });
  assert.deepEqual(
    observed.map((event) => event.kind),
    [EVENT_KINDS.request, EVENT_KINDS.request, EVENT_KINDS.artifact, EVENT_KINDS.correction],
  );
  assert.equal(board.getJob(created.job.id).status, "corrected");
});

test("handoff points at existing correspondence path", () => {
  const board = createWorkBoard();
  const handoff = board.getHandoff();
  assert.equal(handoff.correspondencePath, "/correspondence/");
  assert.match(handoff.contactEmail, /@neomorphic\.io$/);
  assert.match(handoff.note, /does not custody/i);
});

test("UI binder renders job titles through textContent and runs journey", () => {
  const nodes = new Map();
  const makeNode = (tagName = "DIV") => ({
    tagName,
    className: "",
    attrs: {},
    children: [],
    dataset: {},
    hidden: false,
    textContent: "",
    value: "",
    setAttribute(key, value) {
      this.attrs[key] = value;
    },
    addEventListener(_type, handler) {
      this._handler = handler;
    },
    append(...items) {
      this.children.push(...items);
    },
    replaceChildren(...items) {
      this.children = items;
    },
    querySelectorAll() {
      return [];
    },
  });

  globalThis.document = {
    createElement(name) {
      return makeNode(name.toUpperCase());
    },
    createTextNode(text) {
      return { textContent: text };
    },
  };

  const root = {
    querySelector(selector) {
      if (!nodes.has(selector)) {
        const node = makeNode();
        if (selector === "[data-funding-filter]") node.value = "";
        nodes.set(selector, node);
      }
      return nodes.get(selector);
    },
  };

  const ui = bindWorkBoard(root);
  assert.ok(root.querySelector("[data-job-list]").children.length >= 3);
  ui.runSeededJourney();
  const dossier = root.querySelector("[data-job-dossier]");
  const textBlob = JSON.stringify(dossier.children.map((c) => c.textContent));
  assert.match(textBlob, /DEMONSTRATION/i);
  assert.match(textBlob, /Proposal|prop_/i);
  assert.equal(ui.getBoard().listEvents({ jobId: "job_demo_page_diff" }).length, 3);
});

test("page source stays isolated and honest", () => {
  const page = readFileSync(
    join(root, "../../../src/pages/lab/work-board.astro"),
    "utf8",
  );
  assert.match(page, /data-work-board/);
  assert.match(page, /\/lab\/work-board\//);
  assert.match(page, /Custody \/ escrow · not offered/);
  assert.match(page, /href="\/correspondence\/"/);
  assert.match(page, /noindex=\{true\}/);
  assert.match(page, /It is not a hosted marketplace/);
  assert.doesNotMatch(page, /\$\d[\d,]*(?:\.\d+)?\s*(?:reward|bounty|payout)/i);
  assert.doesNotMatch(page, /hosted marketplace is live/i);
});
