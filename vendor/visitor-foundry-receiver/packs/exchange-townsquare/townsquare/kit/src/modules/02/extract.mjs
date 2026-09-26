/**
 * extractProposedActions — answer + evidence → proposed next actions with explicit adoption gate.
 * Never executes content. Always adoption:"required", execute:false, status:"proposed".
 */
import {
  ACTION_SOURCE,
  ADOPTION_GATE,
  CONSUMER_INSTRUCTIONS,
  EXTRACT_STATUS,
  EXCERPT_ECHO_MAX,
  INSTRUCTION_LIKE_RE,
  LEADING_ACTION_RE,
  MODAL_ACTION_RE,
  PACKAGE_ID,
  REUSE_FROM,
  SCHEMA,
} from "./constants.mjs";
import {
  boundStatement,
  extractError,
  normalizeAnswer,
  normalizeCandidateActions,
  normalizeKey,
  slugFromStatement,
  unwrapInput,
  validateEvidenceEntry,
} from "./validate.mjs";
import { ERROR_CODES } from "./constants.mjs";

/** Split text into candidate clauses on . ; newline • or "- " list markers. */
export function splitClauses(text) {
  const raw = String(text || "");
  const parts = raw
    .split(/(?:[.|;]|\n+|•|(?:^|\n)\s*-\s+)/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts;
}

export function isActionableClause(clause) {
  const c = String(clause).trim();
  if (!c || c.length < 3) return false;
  if (LEADING_ACTION_RE.test(c)) return true;
  if (MODAL_ACTION_RE.test(c)) return true;
  return false;
}

export function looksInstructionLike(clause) {
  const c = String(clause).trim();
  if (LEADING_ACTION_RE.test(c)) return true;
  if (/\b(must|should|need to)\b/i.test(c)) return true;
  if (INSTRUCTION_LIKE_RE.test(c)) return true;
  if (/^(?:run|execute|install|delete|sudo|curl)\b/i.test(c)) return true;
  return false;
}

function echoExcerpt(text) {
  const t = String(text);
  if (t.length <= EXCERPT_ECHO_MAX) return t;
  return `${t.slice(0, EXCERPT_ECHO_MAX - 1)}…`;
}

function makeAction({ id, statement, source, evidenceIds, instructionLike }) {
  return {
    id,
    statement: boundStatement(statement),
    source,
    evidenceIds: [...evidenceIds],
    adoption: "required",
    execute: false,
    instructionLike: Boolean(instructionLike),
    status: "proposed",
  };
}

/**
 * @param {object} input — { answer, evidence?, candidateActions? }
 * @param {{ now?: Date|string, demo?: boolean }} [options]
 */
export function extractProposedActions(input, options = {}) {
  const unwrapped = unwrapInput(input);
  const answer = normalizeAnswer(unwrapped.answer);

  const evidenceRaw = unwrapped.evidence == null ? [] : unwrapped.evidence;
  if (!Array.isArray(evidenceRaw)) {
    throw extractError(ERROR_CODES.INVALID_INPUT, "evidence must be an array when present");
  }

  const validatedEvidence = evidenceRaw.map((raw, i) => validateEvidenceEntry(raw, i));
  const candidates = normalizeCandidateActions(unwrapped.candidateActions);

  const now =
    options.now instanceof Date
      ? options.now.toISOString()
      : typeof options.now === "string"
        ? options.now
        : new Date().toISOString();

  const actions = [];
  const skipped = [];
  const missingInputs = [];
  const seen = new Map(); // normalized statement → action index

  function addOrMerge(action) {
    const key = normalizeKey(action.statement);
    if (seen.has(key)) {
      const existing = actions[seen.get(key)];
      for (const eid of action.evidenceIds) {
        if (!existing.evidenceIds.includes(eid)) existing.evidenceIds.push(eid);
      }
      if (action.instructionLike) existing.instructionLike = true;
      // Prefer answer_text / candidate over evidence when merging sources is a no-op; keep first source
      return;
    }
    seen.set(key, actions.length);
    actions.push(action);
  }

  // 1) Parse answer.text
  for (const clause of splitClauses(answer.text)) {
    if (isActionableClause(clause)) {
      addOrMerge(
        makeAction({
          id: slugFromStatement(clause),
          statement: clause,
          source: ACTION_SOURCE.ANSWER_TEXT,
          evidenceIds: [],
          instructionLike: looksInstructionLike(clause),
        }),
      );
    } else {
      skipped.push({ reason: "not_actionable", excerpt: echoExcerpt(clause) });
    }
  }

  // 2) Evidence excerpts
  for (const entry of validatedEvidence) {
    if (!entry.ok) {
      skipped.push({ reason: entry.reason || "malformed_evidence" });
      continue;
    }
    const ev = entry.evidence;
    if (!ev.excerpt) {
      skipped.push({ reason: "evidence_no_excerpt", excerpt: undefined });
      continue;
    }
    for (const clause of splitClauses(ev.excerpt)) {
      if (isActionableClause(clause)) {
        addOrMerge(
          makeAction({
            id: slugFromStatement(clause),
            statement: clause,
            source: ACTION_SOURCE.EVIDENCE_EXCERPT,
            evidenceIds: [ev.id],
            instructionLike: looksInstructionLike(clause),
          }),
        );
      } else {
        skipped.push({
          reason: "not_actionable_evidence",
          excerpt: echoExcerpt(clause),
        });
      }
    }
  }

  // 3) Explicit candidateActions from caller
  for (const cand of candidates) {
    addOrMerge(
      makeAction({
        id: cand.id,
        statement: cand.statement,
        source: ACTION_SOURCE.CANDIDATE,
        evidenceIds: [],
        instructionLike: looksInstructionLike(cand.statement),
      }),
    );
  }

  let status;
  if (actions.length >= 1) {
    status = EXTRACT_STATUS.READY;
  } else {
    status = EXTRACT_STATUS.PARTIAL;
    missingInputs.push("no_actionable_statements");
  }

  // Stable sort by id for determinism
  actions.sort((a, b) => String(a.id).localeCompare(String(b.id)));

  return {
    schema: SCHEMA,
    packageId: PACKAGE_ID,
    status,
    generatedAt: now,
    answerId: answer.id,
    questionId: answer.questionId,
    taskId: answer.taskId,
    actions,
    skipped,
    missingInputs,
    execute: false,
    adoptionGate: ADOPTION_GATE,
    consumerInstructions: CONSUMER_INSTRUCTIONS,
    reuseFrom: {
      townSquareHostileAsData: REUSE_FROM.townSquareHostileAsData,
      notEquivalentTo: [...REUSE_FROM.notEquivalentTo],
    },
    demo:
      answer.demo === true ||
      options.demo === true ||
      unwrapped.demo === true ||
      input?.demo === true,
  };
}

export default extractProposedActions;
