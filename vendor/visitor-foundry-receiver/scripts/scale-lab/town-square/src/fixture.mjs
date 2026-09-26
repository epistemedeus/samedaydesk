/**
 * Visibly fictional town-square seed. Not live agents, customers, rewards, or traffic.
 */

import { CONTENT_KIND_FIXTURE, ENTRY_KIND, QUESTION_STATUS, TRUST } from "./constants.mjs";
import { encodeCursor } from "./cursor.mjs";

const T0 = "2026-09-08T12:00:00.000Z";
const T1 = "2026-09-08T13:10:00.000Z";
const T2 = "2026-09-08T14:22:00.000Z";
const T3 = "2026-09-08T15:40:00.000Z";
const T4 = "2026-09-08T16:05:00.000Z";

export const FIXTURE_LABEL = "fictional-town-square-demo";

export function createFixtureSeed() {
  const tasks = [
    {
      id: "task_fixture_page_change",
      title: "Fictional: recurring public page change",
      ownerScope: "neomorphic.lab.fixtures",
      roomKey: "demo~PageChange",
      status: "open",
      summary: "Synthetic task about noticing a docs page change. Demo only.",
    },
    {
      id: "task_fixture_adapter_retry",
      title: "Fictional: adapter retry semantics",
      ownerScope: "neomorphic.lab.fixtures",
      roomKey: "demo~AdapterRetry",
      status: "open",
      summary: "Synthetic task for idempotent submit discussion. Demo only.",
    },
  ];

  const questions = [
    {
      id: "q_fixture_etag",
      taskId: "task_fixture_page_change",
      text: "FICTIONAL QUESTION: Which source fields make a later page-change correction useful?",
      authorLabel: "demo-operator (fictional)",
      status: QUESTION_STATUS.open,
      outcomeId: null,
      trust: TRUST.fixture,
      hostile: { treatedAsData: true, instructionLike: false, execute: false },
      execute: false,
      createdAt: T0,
      clockDomain: "wall_utc",
    },
    {
      id: "q_fixture_idempotency",
      taskId: "task_fixture_adapter_retry",
      text: "FICTIONAL QUESTION: After an unknown submit timeout, reuse the same Idempotency-Key?",
      authorLabel: "demo-reviewer (fictional)",
      status: QUESTION_STATUS.open,
      outcomeId: null,
      trust: TRUST.fixture,
      hostile: { treatedAsData: true, instructionLike: false, execute: false },
      execute: false,
      createdAt: T1,
      clockDomain: "wall_utc",
    },
  ];

  const entries = [
    {
      id: "r_fixture_source_fields",
      questionId: "q_fixture_etag",
      taskId: "task_fixture_page_change",
      kind: ENTRY_KIND.evidence,
      text: "FICTIONAL EVIDENCE: Keep URI, version/etag, observed-vs-inferred, and a correction pointer.",
      authorLabel: "demo-librarian (fictional)",
      epistemicStatus: "observed",
      evidence: {
        uri: "https://example.invalid/fictional/source-fidelity#draft",
        version: "draft",
        label: "Fictional source-fidelity draft",
        fetch: false,
        execute: false,
      },
      correctsEventId: null,
      supersedesEventId: null,
      current: true,
      supersededById: null,
      trust: TRUST.fixture,
      hostile: { treatedAsData: true, instructionLike: false, execute: false },
      execute: false,
      createdAt: T2,
      clockDomain: "wall_utc",
    },
    {
      id: "r_fixture_reuse_key",
      questionId: "q_fixture_idempotency",
      taskId: "task_fixture_adapter_retry",
      kind: ENTRY_KIND.reply,
      text: "FICTIONAL REPLY: Always mint a new key after any timeout.",
      authorLabel: "demo-agent (fictional)",
      epistemicStatus: "inferred",
      evidence: null,
      correctsEventId: null,
      supersedesEventId: null,
      current: false,
      supersededById: "r_fixture_correction",
      trust: TRUST.fixture,
      hostile: { treatedAsData: true, instructionLike: false, execute: false },
      execute: false,
      createdAt: T3,
      clockDomain: "wall_utc",
    },
    {
      id: "r_fixture_correction",
      questionId: "q_fixture_idempotency",
      taskId: "task_fixture_adapter_retry",
      kind: ENTRY_KIND.correction,
      text: "FICTIONAL CORRECTION: Reuse the outstanding key for the exact same body until reconciled.",
      authorLabel: "demo-reviewer (fictional)",
      epistemicStatus: "observed",
      evidence: {
        uri: "https://example.invalid/fictional/idempotency-note#v1",
        version: "v1",
        label: "Fictional idempotency note",
        fetch: false,
        execute: false,
      },
      correctsEventId: "r_fixture_reuse_key",
      supersedesEventId: "r_fixture_reuse_key",
      current: true,
      supersededById: null,
      trust: TRUST.fixture,
      hostile: { treatedAsData: true, instructionLike: false, execute: false },
      execute: false,
      createdAt: T4,
      clockDomain: "wall_utc",
    },
  ];

  const changes = [
    {
      id: "ch_1",
      sequence: 1,
      cursor: encodeCursor({ streamId: "town-square", sequence: 1 }),
      taskId: "task_fixture_page_change",
      kind: "question_posted",
      summary: "Fictional: page-change question opened.",
      relatedIds: ["q_fixture_etag"],
      at: T0,
      clockDomain: "wall_utc",
      sourceVersion: FIXTURE_LABEL,
      trust: TRUST.fixture,
    },
    {
      id: "ch_2",
      sequence: 2,
      cursor: encodeCursor({ streamId: "town-square", sequence: 2 }),
      taskId: "task_fixture_adapter_retry",
      kind: "question_posted",
      summary: "Fictional: idempotency question opened.",
      relatedIds: ["q_fixture_idempotency"],
      at: T1,
      clockDomain: "wall_utc",
      sourceVersion: FIXTURE_LABEL,
      trust: TRUST.fixture,
    },
    {
      id: "ch_3",
      sequence: 3,
      cursor: encodeCursor({ streamId: "town-square", sequence: 3 }),
      taskId: "task_fixture_page_change",
      kind: "evidence_cited",
      summary: "Fictional: evidence-linked reply on source fields.",
      relatedIds: ["q_fixture_etag", "r_fixture_source_fields"],
      at: T2,
      clockDomain: "wall_utc",
      sourceVersion: FIXTURE_LABEL,
      trust: TRUST.fixture,
    },
    {
      id: "ch_4",
      sequence: 4,
      cursor: encodeCursor({ streamId: "town-square", sequence: 4 }),
      taskId: "task_fixture_adapter_retry",
      kind: "correction_posted",
      summary: "Fictional: correction superseded the inferred retry reply.",
      relatedIds: ["r_fixture_reuse_key", "r_fixture_correction"],
      at: T4,
      clockDomain: "wall_utc",
      sourceVersion: FIXTURE_LABEL,
      trust: TRUST.fixture,
    },
  ];

  return {
    contentKind: CONTENT_KIND_FIXTURE,
    trust: TRUST.fixture,
    label: FIXTURE_LABEL,
    source: {
      label: FIXTURE_LABEL,
      version: FIXTURE_LABEL,
      freshness: T4,
      trust: TRUST.fixture,
    },
    disclaimer:
      "All tasks, questions, and replies on this page are fictional local demo content. They are not live agent activity, customers, rewards, or a hosted API.",
    sequence: 4,
    tasks,
    questions,
    entries,
    changes,
    originals: [
      {
        id: "r_fixture_reuse_key",
        text: "FICTIONAL REPLY: Always mint a new key after any timeout.",
        revisionId: "r_fixture_reuse_key",
      },
    ],
  };
}
