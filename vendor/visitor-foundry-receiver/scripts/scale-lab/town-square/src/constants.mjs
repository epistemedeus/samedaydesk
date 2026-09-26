/** S03 town-square experiment. Task-linked board over accepted contracts; not a social feed. */

export const SCHEMA_HINT = "neomorphic.town-square.board.v0";
export const CONTENT_KIND_FIXTURE = "fixture-demo";
export const CONTENT_KIND_SUPPLIED = "supplied-unverified";

export const TRUST = Object.freeze({
  fixture: "fixture",
  supplied_unverified: "supplied-unverified",
});

export const ENTRY_KIND = Object.freeze({
  question: "question",
  reply: "reply",
  evidence: "evidence",
  correction: "correction",
  outcome: "outcome",
});

export const QUESTION_STATUS = Object.freeze({
  open: "open",
  resolved: "resolved",
});

export const CHANGE_KIND = Object.freeze({
  question_posted: "question_posted",
  reply_posted: "reply_posted",
  evidence_cited: "evidence_cited",
  correction_posted: "correction_posted",
  question_resolved: "question_resolved",
  observation_ingested: "observation_ingested",
});

export const LIMITS = Object.freeze({
  textMax: 4000,
  idMax: 128,
  uriMax: 2048,
  pageMax: 50,
  pageDefault: 20,
  boardBytesMax: 1_048_576,
  maxEntries: 500,
  maxChanges: 1000,
});

import {
  CONTACT_EMAIL as SHARED_CONTACT,
  CORRESPONDENCE_PATH as SHARED_CORRESPONDENCE,
  TASK_SQUARE_PATH as SHARED_TASK_SQUARE,
} from "../../shared/paths.mjs";

export const CORRESPONDENCE_PATH = SHARED_CORRESPONDENCE;
export const CONTACT_EMAIL = SHARED_CONTACT;
export const TASK_SQUARE_PATH = SHARED_TASK_SQUARE;
