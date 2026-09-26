/**
 * buildContradictionPreservingSummary — source-linked summary that keeps
 * conflicting claims and later corrections distinguishable (never flattens consensus).
 */
import {
  CONSUMER_INSTRUCTIONS,
  ENTRY_ROLE,
  ERROR_CODES,
  PACKAGE_ID,
  REUSE_FROM,
  SCHEMA,
  SUMMARY_STATUS,
} from "./constants.mjs";
import {
  assertAcyclicSupersession,
  assertNoForbidden,
  isPlainObject,
  normalizeClaim,
  normalizeCorrection,
  normalizeStanceKey,
  summaryError,
  unwrapInput,
} from "./validate.mjs";

function pickSourceFields(entry) {
  const out = {};
  if (entry.sourceId != null) out.sourceId = entry.sourceId;
  if (entry.sourceUri != null) out.sourceUri = entry.sourceUri;
  if (entry.observedAt != null) out.observedAt = entry.observedAt;
  if (entry.epistemicStatus != null) out.epistemicStatus = entry.epistemicStatus;
  return out;
}

/**
 * Build supersededBy map: targetId → correctionId (last writer wins if multiple).
 * Also return unresolved corrections (unknown supersedesId).
 */
function applyCorrections(claims, corrections) {
  const claimIds = new Set(claims.map((c) => c.id));
  const correctionIds = new Set(corrections.map((c) => c.id));
  const knownIds = new Set([...claimIds, ...correctionIds]);

  assertAcyclicSupersession(corrections, knownIds);

  const supersededBy = new Map(); // id → correctionId
  const unresolvedCorrections = [];

  for (const corr of corrections) {
    if (!knownIds.has(corr.supersedesId) || corr.supersedesId === corr.id) {
      // unknown target (or self) → unresolved; self would also be a cycle but
      // treat missing/self as unresolved when not in known claim/correction set
      // except self-ref on known id should be cyclic — handled above if edges close.
      if (!knownIds.has(corr.supersedesId)) {
        unresolvedCorrections.push({
          id: corr.id,
          supersedesId: corr.supersedesId,
          reason: "unknown_supersedes_id",
          text: corr.text,
          ...pickSourceFields(corr),
        });
        continue;
      }
    }
    // Walk: mark the direct target as superseded by this correction
    supersededBy.set(corr.supersedesId, corr.id);
  }

  // Also mark transitive claim supersession: if correction A supersedes claim X,
  // and correction B supersedes A, then X remains superseded (by A or ultimately B).
  // For visibility we keep direct supersededBy links; claims stay superseded if
  // any correction in the chain points at them (already set).

  return { supersededBy, unresolvedCorrections };
}

/**
 * Detect conflict clusters among active (non-superseded) claims.
 * Rules:
 * - Same conflictGroup + differing normalized stance → conflict
 * - Explicit conflictsWith mutual/unilateral links among active claims → conflict
 */
function detectConflicts(activeClaims) {
  const byId = new Map(activeClaims.map((c) => [c.id, c]));
  const conflicts = [];
  const usedInGroup = new Set();

  // conflictGroup clusters
  const groups = new Map();
  for (const c of activeClaims) {
    if (!c.conflictGroup) continue;
    if (!groups.has(c.conflictGroup)) groups.set(c.conflictGroup, []);
    groups.get(c.conflictGroup).push(c);
  }

  for (const [group, members] of groups) {
    const stanceKeys = [
      ...new Set(
        members
          .map((m) => normalizeStanceKey(m.stance))
          .filter((s) => s != null),
      ),
    ];
    if (stanceKeys.length >= 2) {
      conflicts.push({
        group,
        claimIds: members.map((m) => m.id),
        stances: members.map((m) => m.stance ?? null),
        note: `Active claims in conflictGroup "${group}" disagree on stance (${stanceKeys.join(" vs ")}); conflict preserved, not resolved.`,
      });
      for (const m of members) usedInGroup.add(m.id);
    }
  }

  // explicit conflictsWith edges among active claims
  const pairKeys = new Set();
  for (const c of activeClaims) {
    for (const otherId of c.conflictsWith || []) {
      if (!byId.has(otherId)) continue;
      const a = c.id < otherId ? c.id : otherId;
      const b = c.id < otherId ? otherId : c.id;
      const key = `${a}::${b}`;
      if (pairKeys.has(key)) continue;
      pairKeys.add(key);
      // skip if already covered by a conflictGroup cluster containing both
      if (usedInGroup.has(c.id) && usedInGroup.has(otherId)) continue;
      const other = byId.get(otherId);
      conflicts.push({
        group: `explicit:${a}+${b}`,
        claimIds: [c.id, otherId],
        stances: [c.stance ?? null, other.stance ?? null],
        note: `Explicit conflictsWith link between ${c.id} and ${otherId}; conflict preserved, not resolved.`,
      });
    }
  }

  return conflicts;
}

function buildNarrative({
  topic,
  activeClaims,
  supersededClaims,
  corrections,
  conflicts,
  unresolvedCorrections,
}) {
  const parts = [];
  if (topic) parts.push(`Topic: ${topic}.`);

  if (conflicts.length > 0) {
    const bits = conflicts.map((cf) => {
      const stancePart =
        cf.stances.filter((s) => s != null).length > 0
          ? ` (stances: ${cf.stances.filter(Boolean).join(" vs ")})`
          : "";
      return `conflict among ${cf.claimIds.join(", ")}${stancePart}`;
    });
    parts.push(
      `Active conflict preserved — not flattened to consensus: ${bits.join("; ")}.`,
    );
  } else if (activeClaims.length > 1) {
    parts.push(
      `${activeClaims.length} active claims with no detected stance conflict.`,
    );
  } else if (activeClaims.length === 1) {
    parts.push(`Single active claim (${activeClaims[0].id}); no conflict.`);
  } else {
    parts.push("No active claims remain after corrections.");
  }

  if (corrections.length > 0 && supersededClaims.length > 0) {
    const links = corrections
      .filter((c) =>
        supersededClaims.some(
          (s) => s.supersededBy === c.id || s.id === c.supersedesId,
        ),
      )
      .map((c) => `${c.id} supersedes ${c.supersedesId}`);
    const uniq = [...new Set(links)];
    if (uniq.length > 0) {
      parts.push(
        `Corrections supersede priors (both retained): ${uniq.join("; ")}.`,
      );
    } else {
      parts.push(
        `${corrections.length} correction(s) applied; ${supersededClaims.length} claim(s) marked superseded.`,
      );
    }
  } else if (corrections.length > 0) {
    parts.push(`${corrections.length} correction(s) recorded.`);
  }

  if (unresolvedCorrections.length > 0) {
    parts.push(
      `${unresolvedCorrections.length} unresolved correction(s) (unknown supersedesId).`,
    );
  }

  parts.push("Consensus was not flattened.");
  return parts.join(" ");
}

/**
 * @param {object} input
 * @param {{ now?: Date|string, demo?: boolean }} [options]
 */
export function buildContradictionPreservingSummary(input, options = {}) {
  const unwrapped = unwrapInput(input);

  if (!Array.isArray(unwrapped.claims) || unwrapped.claims.length === 0) {
    throw summaryError(
      ERROR_CODES.MISSING_REQUIREMENT,
      "claims must be a non-empty array",
    );
  }

  const claims = unwrapped.claims.map((c, i) => normalizeClaim(c, i));

  // duplicate claim ids
  const seenClaimIds = new Set();
  for (const c of claims) {
    if (seenClaimIds.has(c.id)) {
      throw summaryError(
        ERROR_CODES.INVALID_INPUT,
        `duplicate claim id ${c.id}`,
        { id: c.id },
      );
    }
    seenClaimIds.add(c.id);
  }

  const correctionsRaw =
    unwrapped.corrections == null ? [] : unwrapped.corrections;
  if (!Array.isArray(correctionsRaw)) {
    throw summaryError(
      ERROR_CODES.INVALID_INPUT,
      "corrections must be an array when present",
    );
  }
  const corrections = correctionsRaw.map((c, i) => normalizeCorrection(c, i));

  const seenCorrIds = new Set();
  for (const c of corrections) {
    if (seenCorrIds.has(c.id) || seenClaimIds.has(c.id)) {
      throw summaryError(
        ERROR_CODES.INVALID_INPUT,
        `duplicate id ${c.id} across claims/corrections`,
        { id: c.id },
      );
    }
    seenCorrIds.add(c.id);
  }

  if (options && isPlainObject(options)) {
    assertNoForbidden(options, "options");
  }

  const now =
    options.now instanceof Date
      ? options.now.toISOString()
      : typeof options.now === "string"
        ? options.now
        : new Date().toISOString();

  const { supersededBy, unresolvedCorrections } = applyCorrections(
    claims,
    corrections,
  );

  const activeClaims = [];
  const supersededClaims = [];

  for (const claim of claims) {
    const by = supersededBy.get(claim.id);
    const base = {
      id: claim.id,
      text: claim.text,
      stance: claim.stance ?? null,
      conflictGroup: claim.conflictGroup ?? null,
      conflictsWith: [...(claim.conflictsWith || [])],
      demo: claim.demo === true || unwrapped.demo === true,
      ...pickSourceFields(claim),
    };
    if (by) {
      supersededClaims.push({
        ...base,
        role: ENTRY_ROLE.SUPERSEDED_CLAIM,
        supersededBy: by,
      });
    } else {
      activeClaims.push({
        ...base,
        role: ENTRY_ROLE.CLAIM,
      });
    }
  }

  // Corrections that resolved (not unresolved) appear in corrections[]
  const unresolvedIds = new Set(unresolvedCorrections.map((u) => u.id));
  const correctionEntries = corrections
    .filter((c) => !unresolvedIds.has(c.id))
    .map((c) => ({
      id: c.id,
      text: c.text,
      supersedesId: c.supersedesId,
      role: ENTRY_ROLE.CORRECTION,
      ...pickSourceFields(c),
    }));

  // Also include corrections that supersede other corrections in the chain —
  // if a claim was superseded by correction A, and A is itself superseded by B,
  // mark A as superseded in a note via supersededBy on correction entries?
  // Spec: keep both claim and correction with roles claim|correction|superseded_claim.
  // Corrections that are themselves superseded stay as corrections but we can
  // attach supersededBy when applicable.
  for (const entry of correctionEntries) {
    const by = supersededBy.get(entry.id);
    if (by) entry.supersededBy = by;
  }

  const conflicts = detectConflicts(activeClaims);

  const status =
    unresolvedCorrections.length > 0
      ? SUMMARY_STATUS.PARTIAL
      : SUMMARY_STATUS.READY;

  const narrative = buildNarrative({
    topic: unwrapped.topic,
    activeClaims,
    supersededClaims,
    corrections: correctionEntries,
    conflicts,
    unresolvedCorrections,
  });

  return {
    schema: SCHEMA,
    packageId: PACKAGE_ID,
    status,
    topic: unwrapped.topic ?? null,
    taskId: unwrapped.taskId ?? null,
    generatedAt: now,
    execute: false,
    consensusFlattened: false,
    activeClaims,
    supersededClaims,
    corrections: correctionEntries,
    unresolvedCorrections,
    conflicts,
    narrative,
    consumerInstructions: CONSUMER_INSTRUCTIONS,
    reuseFrom: {
      townSquarePostCorrection: REUSE_FROM.townSquarePostCorrection,
      taskMemoryAssertCorrectionLineage:
        REUSE_FROM.taskMemoryAssertCorrectionLineage,
      notEquivalentTo: [...REUSE_FROM.notEquivalentTo],
    },
    demo: options.demo === true || unwrapped.demo === true,
  };
}
