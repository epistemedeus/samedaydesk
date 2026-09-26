/**
 * applyConversationWriteControls — pure admit/reject evaluation over proposed
 * conversation writes with per-thread budgets, bounded duplicates/replays, and
 * correction preservation (correctionsPreferBudget:true).
 */
import {
  CONSUMER_INSTRUCTIONS,
  CONTROL_STATUS,
  CORRECTIONS_PREFER_BUDGET,
  PACKAGE_ID,
  REUSE_FROM,
  SCHEMA,
} from "./constants.mjs";
import {
  isCorrectionWrite,
  isReplayWrite,
  normalizePriorWrite,
  tryNormalizeWrite,
  unwrapInput,
} from "./validate.mjs";

/**
 * @param {object} input
 * @param {{
 *   now?: string,
 *   demo?: boolean,
 *   budget?: object,
 *   maxWrites?: number,
 *   maxBytes?: number,
 *   maxDuplicates?: number,
 *   correctionReserve?: number,
 * }} [options]
 */
export function applyConversationWriteControls(input, options = {}) {
  const normalized = unwrapInput(input, options);
  const now =
    typeof options.now === "string" && options.now.trim()
      ? options.now.trim()
      : new Date().toISOString();
  const { threadId, budget, demo } = normalized;
  const { maxWrites, maxBytes, maxDuplicates, correctionReserve } = budget;

  // --- Prior baseline ---
  const priorAccepted = [];
  for (let i = 0; i < normalized.priorWrites.length; i++) {
    const p = normalizePriorWrite(normalized.priorWrites[i], i);
    if (p) priorAccepted.push(p);
  }

  const admittedIds = new Set(priorAccepted.map((p) => p.id));
  /** @type {Map<string, number>} count of non-correction bodies seen */
  const bodyCounts = new Map();
  let writesUsed = priorAccepted.length;
  let bytesUsed = priorAccepted.reduce((n, p) => n + p.byteSize, 0);

  for (const p of priorAccepted) {
    if (!isCorrectionWrite(p)) {
      const c = bodyCounts.get(p.normalizedText) || 0;
      bodyCounts.set(p.normalizedText, c + 1);
    }
  }

  // --- Normalize proposed ---
  const skipped = [];
  const proposed = [];
  for (let i = 0; i < normalized.proposedWrites.length; i++) {
    const result = tryNormalizeWrite(normalized.proposedWrites[i], i);
    if (result.ok) proposed.push(result.value);
    else skipped.push(result.skipped);
  }

  const decisions = [];
  const preservedCorrections = [];
  let admittedCount = 0;
  let rejectedCount = 0;
  let bytesAdmitted = 0;
  let duplicatesRetained = 0;
  let correctionReserveUsed = 0;

  for (const write of proposed) {
    const reasons = [];
    let classification;
    let decision;

    const correction = isCorrectionWrite(write);
    const replay = isReplayWrite(write);

    // Classification priority: correction > replay > duplicate > write
    if (correction) {
      classification = "correction";
    } else if (replay) {
      classification = "replay";
    } else {
      const seen = bodyCounts.get(write.normalizedText) || 0;
      if (seen > 0) {
        classification = "duplicate";
      } else {
        classification = "write";
      }
    }

    if (classification === "replay") {
      // Default reject unless it is also a correction (handled above)
      decision = "reject";
      reasons.push("replay_rejected");
    } else if (classification === "duplicate") {
      const seen = bodyCounts.get(write.normalizedText) || 0;
      // duplicates so far for this body = seen - 1 (first is original); next would be seen-th duplicate? 
      // seen is count of identical bodies already retained; admitting another adds a dup notice.
      const duplicateIndex = seen; // 1-based among retained identical bodies after original? 
      // If seen=1 (original only), this is first dup notice (index 1).
      // Admit while number of dup notices retained for this body < maxDuplicates.
      // dup notices already = max(0, seen - 1)
      const priorDupNotices = Math.max(0, seen - 1);
      const overWriteBudget = writesUsed >= maxWrites;
      const overByteBudget = bytesUsed + write.byteSize > maxBytes;

      if (priorDupNotices >= maxDuplicates) {
        decision = "reject";
        reasons.push("duplicate_limit");
      } else if (overWriteBudget || overByteBudget) {
        decision = "reject";
        reasons.push("duplicate_budget");
        if (overWriteBudget) reasons.push("max_writes");
        if (overByteBudget) reasons.push("max_bytes");
      } else {
        decision = "admit";
        reasons.push("duplicate_notice");
      }
    } else if (classification === "correction") {
      const overWriteBudget = writesUsed >= maxWrites;
      const overByteBudget = bytesUsed + write.byteSize > maxBytes;
      const overBudget = overWriteBudget || overByteBudget;
      const correctsAdmittedPrior =
        typeof write.correctsId === "string" && admittedIds.has(write.correctsId);
      const reserveAvailable = correctionReserveUsed < correctionReserve;

      if (!overBudget) {
        decision = "admit";
        reasons.push("correction_admitted");
        if (correctsAdmittedPrior) reasons.push("corrects_admitted_prior");
      } else if (CORRECTIONS_PREFER_BUDGET && (reserveAvailable || correctsAdmittedPrior)) {
        decision = "admit";
        reasons.push("correction_preserved");
        if (correctsAdmittedPrior) reasons.push("corrects_admitted_prior");
        if (reserveAvailable) reasons.push("correction_reserve");
        if (overWriteBudget) reasons.push("over_max_writes");
        if (overByteBudget) reasons.push("over_max_bytes");
      } else {
        decision = "reject";
        reasons.push("correction_budget_exhausted");
        if (overWriteBudget) reasons.push("max_writes");
        if (overByteBudget) reasons.push("max_bytes");
      }
    } else {
      // normal write
      const overWriteBudget = writesUsed >= maxWrites;
      const overByteBudget = bytesUsed + write.byteSize > maxBytes;
      if (overWriteBudget || overByteBudget) {
        decision = "reject";
        reasons.push("budget_exhausted");
        if (overWriteBudget) reasons.push("max_writes");
        if (overByteBudget) reasons.push("max_bytes");
      } else {
        decision = "admit";
        reasons.push("within_budget");
      }
    }

    const entry = {
      id: write.id,
      decision,
      reasons,
      classification,
    };
    decisions.push(entry);

    if (decision === "admit") {
      admittedCount += 1;
      bytesAdmitted += write.byteSize;
      writesUsed += 1;
      bytesUsed += write.byteSize;
      admittedIds.add(write.id);

      if (classification === "duplicate") {
        duplicatesRetained += 1;
        const c = bodyCounts.get(write.normalizedText) || 0;
        bodyCounts.set(write.normalizedText, c + 1);
      } else if (classification === "correction") {
        if (reasons.includes("correction_preserved")) {
          preservedCorrections.push({
            id: write.id,
            correctsId: write.correctsId || null,
            reasons: [...reasons],
          });
          if (reasons.includes("correction_reserve")) {
            correctionReserveUsed += 1;
          }
        }
        // Corrections do not seed duplicate bodyCounts (spec: not correction)
      } else if (classification === "write") {
        const c = bodyCounts.get(write.normalizedText) || 0;
        bodyCounts.set(write.normalizedText, c + 1);
      }
    } else {
      rejectedCount += 1;
    }
  }

  const status =
    skipped.length > 0 ? CONTROL_STATUS.PARTIAL : CONTROL_STATUS.READY;

  return {
    schema: SCHEMA,
    packageId: PACKAGE_ID,
    status,
    threadId,
    decisions,
    admittedCount,
    rejectedCount,
    bytesAdmitted,
    budget: {
      maxWrites,
      maxBytes,
      maxDuplicates,
      correctionReserve,
    },
    budgetSnapshot: {
      priorWrites: priorAccepted.length,
      writesUsed,
      bytesUsed,
      duplicatesRetained,
      correctionReserveUsed,
      maxWrites,
      maxBytes,
      maxDuplicates,
      correctionReserve,
    },
    preservedCorrections,
    skipped,
    correctionsPreferBudget: CORRECTIONS_PREFER_BUDGET,
    execute: false,
    consumerInstructions: CONSUMER_INSTRUCTIONS,
    reuseFrom: REUSE_FROM,
    createdAt: now,
    demo,
  };
}
