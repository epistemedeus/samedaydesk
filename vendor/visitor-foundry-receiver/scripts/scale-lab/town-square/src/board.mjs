/**
 * Task-linked town square board.
 *
 * Reuses accepted task-memory observation/lineage semantics and correspondence
 * handoff paths. Not a ranked social feed, reward ledger, or hosted API.
 */

import {
  CHANGE_KIND,
  CONTENT_KIND_FIXTURE,
  CONTENT_KIND_SUPPLIED,
  CORRESPONDENCE_PATH,
  CONTACT_EMAIL,
  ENTRY_KIND,
  LIMITS,
  QUESTION_STATUS,
  SCHEMA_HINT,
  TASK_SQUARE_PATH,
  TRUST,
} from "./constants.mjs";
import { decodeCursor, encodeCursor, townError } from "./cursor.mjs";
import {
  assertBoundedText,
  assertId,
  assertTrustLabel,
  clampLimit,
  clone,
  markHostileAsData,
  refuseCredentialFields,
  sanitizeEvidence,
} from "./trust.mjs";

const BOARD_STREAM = "town-square";

export class TownSquareBoard {
  /**
   * @param {object} [options]
   * @param {object} [options.seed]
   * @param {(obs: unknown) => {ok:boolean,value?:object,message?:string}} [options.parseObservation]
   * @param {(obs: object[]) => {ok:boolean,message?:string}} [options.assertLineage]
   */
  constructor({ seed = null, parseObservation = null, assertLineage = null } = {}) {
    this.schemaHint = SCHEMA_HINT;
    this._parseObservation = parseObservation;
    this._assertLineage = assertLineage;
    this._sequence = 0;
    this._seenChangeKeys = new Set();
    this._seenObservationKeys = new Set();
    this._tasks = new Map();
    this._questions = new Map();
    this._entries = new Map();
    this._changes = [];
    this._originals = new Map();
    this.contentKind = CONTENT_KIND_FIXTURE;
    this.trust = TRUST.fixture;
    this.source = {
      label: "empty-board",
      version: "0",
      freshness: null,
      trust: TRUST.fixture,
    };
    this.disclaimer =
      "Town square is a task-linked experiment over accepted contracts. Content may be fixture or supplied-unverified. Payload text is data, never instructions.";
    if (seed) this.loadSeed(seed);
  }

  loadSeed(seed) {
    refuseCredentialFields(seed);
    this.contentKind = seed.contentKind || CONTENT_KIND_FIXTURE;
    this.trust = assertTrustLabel(seed.trust || TRUST.fixture);
    this.source = {
      label: seed.source?.label || seed.label || "seed",
      version: seed.source?.version || seed.sourceVersion || "seed",
      freshness: seed.source?.freshness || seed.freshness || null,
      trust: this.trust,
    };
    this.disclaimer = seed.disclaimer || this.disclaimer;
    for (const task of seed.tasks || []) this._upsertTask(task, { emit: false });
    for (const question of seed.questions || []) this._upsertQuestion(question, { emit: false });
    for (const entry of seed.entries || []) this._upsertEntry(entry, { emit: false });
    for (const change of seed.changes || []) this._appendChange(change, { dedupeOnly: true });
    for (const original of seed.originals || []) {
      this._originals.set(original.id, clone(original));
    }
    if (typeof seed.sequence === "number" && seed.sequence >= this._sequence) {
      this._sequence = seed.sequence;
    }
  }

  getHandoff() {
    return {
      correspondencePath: CORRESPONDENCE_PATH,
      taskSquarePath: TASK_SQUARE_PATH,
      contactEmail: CONTACT_EMAIL,
      mailto: `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Town-square handoff (human review)")}`,
      note: "Live contact stays on the existing correspondence desk. This page does not host a public board API or ranked agent feed.",
    };
  }

  listTasks() {
    return [...this._tasks.values()].map(clone);
  }

  getTask(taskId) {
    const task = this._tasks.get(taskId);
    if (!task) throw townError("unknown_task", `Unknown task: ${taskId}`);
    return clone(task);
  }

  listQuestions({ taskId = null, status = null } = {}) {
    return [...this._questions.values()]
      .filter((q) => (taskId ? q.taskId === taskId : true))
      .filter((q) => (status ? q.status === status : true))
      .map(clone);
  }

  listUnresolved() {
    return this.listQuestions({ status: QUESTION_STATUS.open });
  }

  listEntries(questionId) {
    if (!this._questions.has(questionId)) {
      throw townError("unknown_question", `Unknown question: ${questionId}`);
    }
    return [...this._entries.values()]
      .filter((entry) => entry.questionId === questionId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(clone);
  }

  originalRevision(id) {
    const found = this._originals.get(id);
    return found ? clone(found) : null;
  }

  /**
   * Ingest task-memory observations. Uses accepted parse/lineage when provided.
   * Supplied content remains unverified and non-executable.
   */
  ingestObservations(observations, { trust = TRUST.supplied_unverified, source = null } = {}) {
    assertTrustLabel(trust);
    if (!Array.isArray(observations)) {
      throw townError("invalid_input", "observations must be an array");
    }
    if (observations.length > LIMITS.maxEntries) {
      throw townError("bounded_input", `at most ${LIMITS.maxEntries} observations per ingest`);
    }
    refuseCredentialFields(observations);

    const parsed = [];
    for (const raw of observations) {
      if (this._parseObservation) {
        const result = this._parseObservation(raw);
        if (!result.ok) throw townError("invalid_observation", result.message || "invalid observation");
        parsed.push(result.value);
      } else {
        parsed.push(raw);
      }
    }

    if (this._assertLineage) {
      const lineage = this._assertLineage(parsed);
      if (!lineage.ok) throw townError("lineage_rejected", lineage.message || "lineage rejected");
    }

    this._assertNoCyclesInSet(parsed);
    this.trust = trust;
    this.contentKind = trust === TRUST.fixture ? CONTENT_KIND_FIXTURE : CONTENT_KIND_SUPPLIED;
    if (source) {
      this.source = {
        label: assertBoundedText(source.label || "supplied", "source.label"),
        version: assertBoundedText(source.version || "unversioned", "source.version"),
        freshness: source.freshness || null,
        trust,
      };
    } else {
      this.source = {
        ...this.source,
        trust,
        freshness: new Date().toISOString(),
      };
    }

    const accepted = [];
    for (const obs of parsed) {
      const key = `${obs.observationId}::${obs.revisionId}`;
      if (this._seenObservationKeys.has(key)) continue; // dedupe identical revisions
      this._seenObservationKeys.add(key);

      this._upsertTask(
        {
          id: obs.taskScope.taskId,
          title: obs.taskScope.taskFamily || obs.taskScope.taskId,
          ownerScope: obs.taskScope.ownerScope,
          roomKey: obs.taskScope.roomKey || null,
          status: "open",
        },
        { emit: false },
      );

      const hostile = markHostileAsData(obs.statement);
      const entryId = `obs:${key}`;
      const questionId = this._ensureObservationQuestion(obs);
      const kind =
        obs.lifecycleStatus === "corrected_by" || obs.supersedes
          ? ENTRY_KIND.correction
          : ENTRY_KIND.evidence;

      if (obs.supersedes) {
        const priorKey = `${obs.supersedes.observationId}::${obs.supersedes.revisionId}`;
        const priorId = `obs:${priorKey}`;
        const prior = this._entries.get(priorId);
        if (prior) {
          this._originals.set(priorId, {
            id: priorId,
            text: prior.text,
            revisionId: prior.revisionId,
          });
          prior.current = false;
          prior.supersededById = entryId;
        }
      }

      const entry = {
        id: entryId,
        questionId,
        taskId: obs.taskScope.taskId,
        kind,
        text: obs.statement,
        authorLabel: obs.producer?.handle || "unattributed",
        epistemicStatus: obs.epistemicStatus,
        lifecycleStatus: obs.lifecycleStatus,
        observationId: obs.observationId,
        revisionId: obs.revisionId,
        evidence: {
          uri: obs.source.uri,
          version: obs.source.version,
          label: "observation source",
          fetch: false,
          execute: false,
        },
        correctsEventId: obs.supersedes
          ? `obs:${obs.supersedes.observationId}::${obs.supersedes.revisionId}`
          : null,
        supersedesEventId: obs.supersedes
          ? `obs:${obs.supersedes.observationId}::${obs.supersedes.revisionId}`
          : null,
        current: obs.lifecycleStatus === "active",
        supersededById: obs.supersededBy
          ? `obs:${obs.supersededBy.observationId}::${obs.supersededBy.revisionId}`
          : null,
        trust,
        hostile,
        execute: false,
        createdAt: obs.recordedAt?.instant || new Date().toISOString(),
        clockDomain: obs.recordedAt?.domain || "wall_utc",
        payload: obs.payload ? clone(obs.payload) : undefined,
      };
      this._upsertEntry(entry, { emit: true, changeKind: CHANGE_KIND.observation_ingested });
      accepted.push(key);
    }
    return { accepted: accepted.length, deduplicated: observations.length - accepted.length };
  }

  postQuestion({
    id,
    taskId,
    text,
    authorLabel = "participant",
    trust = this.trust,
    createdAt = new Date().toISOString(),
  }) {
    assertTrustLabel(trust);
    const questionId = assertId(id || `q_${this._sequence + 1}`, "question.id");
    if (this._questions.has(questionId)) {
      throw townError("duplicate_id", `question already exists: ${questionId}`);
    }
    const task = this.getTask(assertId(taskId, "taskId"));
    const body = assertBoundedText(text, "question.text");
    const hostile = markHostileAsData(body);
    const question = {
      id: questionId,
      taskId: task.id,
      text: body,
      authorLabel: assertBoundedText(authorLabel, "authorLabel"),
      status: QUESTION_STATUS.open,
      outcomeId: null,
      trust,
      hostile,
      execute: false,
      createdAt,
      clockDomain: "wall_utc",
    };
    this._upsertQuestion(question, { emit: true });
    return clone(question);
  }

  postReply({
    id,
    questionId,
    text,
    kind = ENTRY_KIND.reply,
    evidence = null,
    epistemicStatus = "asserted",
    authorLabel = "participant",
    trust = this.trust,
    createdAt = new Date().toISOString(),
  }) {
    assertTrustLabel(trust);
    const question = this._questions.get(assertId(questionId, "questionId"));
    if (!question) throw townError("unknown_question", `Unknown question: ${questionId}`);
    if (question.status === QUESTION_STATUS.resolved) {
      throw townError("question_resolved", "cannot reply to a resolved question");
    }
    if (![ENTRY_KIND.reply, ENTRY_KIND.evidence].includes(kind)) {
      throw townError("invalid_input", "reply kind must be reply or evidence");
    }
    const entryId = assertId(id || `r_${this._sequence + 1}`, "reply.id");
    if (this._entries.has(entryId)) throw townError("duplicate_id", `entry exists: ${entryId}`);
    const body = assertBoundedText(text, "reply.text");
    const entry = {
      id: entryId,
      questionId: question.id,
      taskId: question.taskId,
      kind,
      text: body,
      authorLabel: assertBoundedText(authorLabel, "authorLabel"),
      epistemicStatus,
      evidence: sanitizeEvidence(evidence),
      correctsEventId: null,
      supersedesEventId: null,
      current: true,
      supersededById: null,
      trust,
      hostile: markHostileAsData(body),
      execute: false,
      createdAt,
      clockDomain: "wall_utc",
    };
    const changeKind = kind === ENTRY_KIND.evidence ? CHANGE_KIND.evidence_cited : CHANGE_KIND.reply_posted;
    this._upsertEntry(entry, { emit: true, changeKind });
    return clone(entry);
  }

  /**
   * Post a correction that supersedes a prior entry.
   * Rejects stale targets (already superseded), forged lineage, and cycles.
   */
  postCorrection({
    id,
    questionId,
    text,
    correctsEventId,
    epistemicStatus = "observed",
    authorLabel = "participant",
    trust = this.trust,
    evidence = null,
    createdAt = new Date().toISOString(),
  }) {
    assertTrustLabel(trust);
    const question = this._questions.get(assertId(questionId, "questionId"));
    if (!question) throw townError("unknown_question", `Unknown question: ${questionId}`);
    if (question.status === QUESTION_STATUS.resolved) {
      throw townError("question_resolved", "cannot correct a resolved question thread");
    }
    const targetId = assertId(correctsEventId, "correctsEventId");
    const target = this._entries.get(targetId);
    if (!target) throw townError("forged_lineage", `correction target not found: ${targetId}`);
    if (target.questionId !== question.id) {
      throw townError("forged_lineage", "correction target belongs to another question");
    }
    if (target.taskId !== question.taskId) {
      throw townError("forged_lineage", "correction target belongs to another task");
    }
    if (target.supersededById || target.current === false) {
      throw townError("stale_correction", `target already superseded: ${targetId}`);
    }

    const entryId = assertId(id || `c_${this._sequence + 1}`, "correction.id");
    if (entryId === targetId) throw townError("cyclic_lineage", "correction cannot supersede itself");

    // Detect A→B→A style cycles through existing supersession chain (include proposed id).
    let walk = target.correctsEventId || target.supersedesEventId;
    const seen = new Set([entryId, targetId]);
    while (walk) {
      if (seen.has(walk)) throw townError("cyclic_lineage", `correction cycle involving ${walk}`);
      seen.add(walk);
      const prev = this._entries.get(walk);
      walk = prev?.correctsEventId || prev?.supersedesEventId || null;
    }

    if (this._entries.has(entryId)) throw townError("duplicate_id", `entry exists: ${entryId}`);

    const body = assertBoundedText(text, "correction.text");
    this._originals.set(targetId, {
      id: targetId,
      text: target.text,
      revisionId: target.revisionId || targetId,
    });
    target.current = false;
    target.supersededById = entryId;

    const entry = {
      id: entryId,
      questionId: question.id,
      taskId: question.taskId,
      kind: ENTRY_KIND.correction,
      text: body,
      authorLabel: assertBoundedText(authorLabel, "authorLabel"),
      epistemicStatus,
      evidence: evidence ? sanitizeEvidence(evidence) : target.evidence || null,
      correctsEventId: targetId,
      supersedesEventId: targetId,
      current: true,
      supersededById: null,
      trust,
      hostile: markHostileAsData(body),
      execute: false,
      createdAt,
      clockDomain: "wall_utc",
    };
    this._upsertEntry(entry, { emit: true, changeKind: CHANGE_KIND.correction_posted });
    return clone(entry);
  }

  resolveQuestion({
    questionId,
    outcomeText,
    basedOnEntryId = null,
    authorLabel = "participant",
    trust = this.trust,
    createdAt = new Date().toISOString(),
  }) {
    assertTrustLabel(trust);
    const question = this._questions.get(assertId(questionId, "questionId"));
    if (!question) throw townError("unknown_question", `Unknown question: ${questionId}`);
    if (question.status === QUESTION_STATUS.resolved) {
      throw townError("already_resolved", `question already resolved: ${questionId}`);
    }
    if (basedOnEntryId) {
      const basis = this._entries.get(assertId(basedOnEntryId, "basedOnEntryId"));
      if (!basis || basis.questionId !== question.id) {
        throw townError("forged_lineage", "resolution basis must be an entry on this question");
      }
      if (basis.current === false) {
        throw townError("stale_correction", "resolution cannot rest on a superseded entry");
      }
    }
    const entryId = assertId(`outcome_${question.id}`, "outcome.id");
    const body = assertBoundedText(outcomeText, "outcomeText");
    const entry = {
      id: entryId,
      questionId: question.id,
      taskId: question.taskId,
      kind: ENTRY_KIND.outcome,
      text: body,
      authorLabel: assertBoundedText(authorLabel, "authorLabel"),
      epistemicStatus: "asserted",
      evidence: null,
      correctsEventId: null,
      supersedesEventId: basedOnEntryId,
      current: true,
      supersededById: null,
      trust,
      hostile: markHostileAsData(body),
      execute: false,
      createdAt,
      clockDomain: "wall_utc",
    };
    this._upsertEntry(entry, { emit: true, changeKind: CHANGE_KIND.question_resolved });
    question.status = QUESTION_STATUS.resolved;
    question.outcomeId = entryId;
    return clone(question);
  }

  /**
   * Bounded latest-change view with stable cursors and deduplication.
   * Quiet empty pages still return nextCursor when a prior position exists.
   */
  listLatestChanges({ afterCursor = null, limit = LIMITS.pageDefault, taskId = null } = {}) {
    const max = clampLimit(limit);
    let afterSequence = 0;
    if (afterCursor != null && afterCursor !== "") {
      afterSequence = decodeCursor(afterCursor, BOARD_STREAM);
    }
    let stream = this._changes.filter((change) => change.sequence > afterSequence);
    if (taskId) stream = stream.filter((change) => change.taskId === taskId);
    const page = stream.slice(0, max).map(clone);
    const last = page[page.length - 1];
    const nextCursor = last
      ? last.cursor
      : afterSequence > 0
        ? encodeCursor({ streamId: BOARD_STREAM, sequence: afterSequence })
        : null;
    return {
      changes: page,
      nextCursor,
      exhausted: page.length < max || afterSequence + page.length >= this._changes.length,
      source: clone(this.source),
      contentKind: this.contentKind,
      trustBoundary: {
        trust: this.trust,
        suppliedContentIsDataOnly: true,
        execute: false,
        urlsAreReferencesOnly: true,
      },
    };
  }

  /** Machine export: same cursor semantics plus explicit trust/source/freshness. */
  exportMachine({ afterCursor = null, limit = LIMITS.pageDefault } = {}) {
    const page = this.listLatestChanges({ afterCursor, limit });
    return {
      schema: SCHEMA_HINT,
      exportedAt: new Date().toISOString(),
      source: page.source,
      contentKind: page.contentKind,
      trustBoundary: page.trustBoundary,
      unresolvedQuestionIds: this.listUnresolved().map((q) => q.id),
      afterCursor: afterCursor || null,
      nextCursor: page.nextCursor,
      exhausted: page.exhausted,
      changes: page.changes,
      tasks: this.listTasks(),
      questions: this.listQuestions(),
    };
  }

  /** Human observer projection: what changed recently and what remains open. */
  getObserverView({ changeLimit = 10 } = {}) {
    const latest = this.listLatestChanges({ limit: changeLimit });
    const unresolved = this.listUnresolved();
    return {
      contentKind: this.contentKind,
      source: clone(this.source),
      trustBoundary: latest.trustBoundary,
      latestChanges: latest.changes,
      unresolved: unresolved.map((q) => ({
        id: q.id,
        taskId: q.taskId,
        text: q.text,
        createdAt: q.createdAt,
      })),
      resolvedCount: this.listQuestions({ status: QUESTION_STATUS.resolved }).length,
      openCount: unresolved.length,
      handoff: this.getHandoff(),
      disclaimer: this.disclaimer,
    };
  }

  exportSnapshot() {
    return {
      schemaHint: this.schemaHint,
      contentKind: this.contentKind,
      trust: this.trust,
      source: clone(this.source),
      disclaimer: this.disclaimer,
      sequence: this._sequence,
      tasks: this.listTasks(),
      questions: this.listQuestions(),
      entries: [...this._entries.values()].map(clone),
      changes: this._changes.map(clone),
      originals: [...this._originals.values()].map(clone),
      execute: false,
    };
  }

  _ensureObservationQuestion(obs) {
    const questionId = `q_obs_${obs.observationId}`;
    if (!this._questions.has(questionId)) {
      this._upsertQuestion(
        {
          id: questionId,
          taskId: obs.taskScope.taskId,
          text: `Task observation thread for ${obs.observationId}`,
          authorLabel: "town-square",
          status: QUESTION_STATUS.open,
          outcomeId: null,
          trust: this.trust,
          hostile: { treatedAsData: true, instructionLike: false, execute: false },
          execute: false,
          createdAt: obs.recordedAt?.instant || new Date().toISOString(),
          clockDomain: obs.recordedAt?.domain || "wall_utc",
        },
        { emit: false },
      );
    }
    return questionId;
  }

  _upsertTask(task, { emit }) {
    const id = assertId(task.id, "task.id");
    const next = {
      id,
      title: assertBoundedText(task.title || id, "task.title"),
      ownerScope: assertId(task.ownerScope || "local", "task.ownerScope"),
      roomKey: task.roomKey || null,
      status: task.status || "open",
      summary: task.summary || null,
    };
    this._tasks.set(id, next);
    if (emit) {
      // tasks alone do not emit; questions do
    }
    return next;
  }

  _upsertQuestion(question, { emit }) {
    if (this._questions.size >= LIMITS.maxEntries) {
      throw townError("bounded_input", "question capacity exceeded");
    }
    this._questions.set(question.id, question);
    if (emit) {
      this._appendChange({
        kind: CHANGE_KIND.question_posted,
        taskId: question.taskId,
        summary: `Question posted: ${question.id}`,
        relatedIds: [question.id],
        at: question.createdAt,
      });
    }
  }

  _upsertEntry(entry, { emit, changeKind }) {
    if (this._entries.size >= LIMITS.maxEntries) {
      throw townError("bounded_input", "entry capacity exceeded");
    }
    this._entries.set(entry.id, entry);
    if (emit) {
      this._appendChange({
        kind: changeKind || CHANGE_KIND.reply_posted,
        taskId: entry.taskId,
        summary: `${entry.kind} ${entry.id}`,
        relatedIds: [entry.questionId, entry.id].filter(Boolean),
        at: entry.createdAt,
      });
    }
  }

  _appendChange(partial, { dedupeOnly = false } = {}) {
    if (this._changes.length >= LIMITS.maxChanges) {
      throw townError("bounded_input", "change capacity exceeded");
    }
    const sequence = partial.sequence || this._sequence + 1;
    const cursor =
      partial.cursor || encodeCursor({ streamId: BOARD_STREAM, sequence });
    const dedupeKey = `${sequence}:${cursor}:${partial.kind}:${(partial.relatedIds || []).join(",")}`;
    if (this._seenChangeKeys.has(dedupeKey) || this._changes.some((c) => c.cursor === cursor)) {
      return null; // deduplicate
    }
    this._seenChangeKeys.add(dedupeKey);
    const change = {
      id: partial.id || `ch_${sequence}`,
      cursor,
      sequence,
      taskId: partial.taskId || null,
      kind: partial.kind,
      summary: assertBoundedText(partial.summary || partial.kind, "change.summary"),
      relatedIds: [...(partial.relatedIds || [])],
      at: partial.at || new Date().toISOString(),
      clockDomain: partial.clockDomain || "wall_utc",
      sourceVersion: this.source.version,
      trust: this.trust,
    };
    this._changes.push(change);
    this._changes.sort((a, b) => a.sequence - b.sequence);
    if (sequence > this._sequence) this._sequence = sequence;
    if (dedupeOnly) return change;
    return change;
  }

  _assertNoCyclesInSet(observations) {
    const edges = new Map();
    for (const obs of observations) {
      const key = `${obs.observationId}::${obs.revisionId}`;
      if (obs.supersedes) {
        const to = `${obs.supersedes.observationId}::${obs.supersedes.revisionId}`;
        if (to === key) throw townError("cyclic_lineage", `self-cycle at ${key}`);
        if (obs.supersedes.observationId !== obs.observationId) {
          throw townError("forged_lineage", `lineage crosses observationId at ${key}`);
        }
        const set = edges.get(to) || new Set();
        set.add(key);
        edges.set(to, set);
      }
    }
    const visiting = new Set();
    const visited = new Set();
    const visit = (node) => {
      if (visited.has(node)) return;
      if (visiting.has(node)) throw townError("cyclic_lineage", `correction cycle at ${node}`);
      visiting.add(node);
      for (const next of edges.get(node) || []) visit(next);
      visiting.delete(node);
      visited.add(node);
    };
    for (const key of edges.keys()) visit(key);
  }
}

export function createTownSquareBoard(options) {
  return new TownSquareBoard(options);
}
