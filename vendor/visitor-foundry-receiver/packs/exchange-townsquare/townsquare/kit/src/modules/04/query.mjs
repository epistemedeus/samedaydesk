import {
  CONSUMER_INSTRUCTIONS,
  PACKAGE_ID,
  QUERY_STATUS,
  SCHEMA,
} from "./constants.mjs";
import {
  decodeCursor,
  encodeCursor,
  tryNormalizeUpdate,
  unwrapInput,
} from "./validate.mjs";

/**
 * Match an update against subscription filters (AND across provided fields).
 * Returns matchedFilters reasons, or null if non-match.
 *
 * Deadline rule: if a deadline filter is set and update.taskDeadline is
 * null/missing, the update is excluded (non-match).
 */
export function matchUpdate(update, subscription, lastReadByTask) {
  const matchedFilters = [];
  const sub = subscription || {};

  if (sub.taskIds != null) {
    if (!sub.taskIds.includes(update.taskId)) return null;
    matchedFilters.push("task_id");
  }

  if (sub.capabilities != null) {
    const set = new Set(update.capabilityIds || []);
    const overlaps = sub.capabilities.filter((c) => set.has(c));
    if (overlaps.length < 1) return null;
    for (const c of overlaps) matchedFilters.push(`capability:${c}`);
  }

  const deadlineFilterSet = sub.deadlineBefore != null || sub.deadlineAfter != null;
  if (deadlineFilterSet) {
    if (update.taskDeadline == null) return null;
    const updateMs = Date.parse(update.taskDeadline);
    if (Number.isNaN(updateMs)) return null;

    if (sub.deadlineBefore != null) {
      const beforeMs = Date.parse(sub.deadlineBefore);
      if (updateMs > beforeMs) return null;
      matchedFilters.push("deadline_before");
    }
    if (sub.deadlineAfter != null) {
      const afterMs = Date.parse(sub.deadlineAfter);
      if (updateMs < afterMs) return null;
      matchedFilters.push("deadline_after");
    }
  }

  if (sub.unreadOnly === true) {
    const lastRead = lastReadByTask[update.taskId] ?? 0;
    if (!(update.revision > lastRead)) return null;
    matchedFilters.push("unread_revision");
  }

  return matchedFilters;
}

function stableCompare(a, b) {
  if (a.createdAt < b.createdAt) return -1;
  if (a.createdAt > b.createdAt) return 1;
  if (a.taskId < b.taskId) return -1;
  if (a.taskId > b.taskId) return 1;
  if (a.revision < b.revision) return -1;
  if (a.revision > b.revision) return 1;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

/**
 * Finite pull query for task subscription filters. Pure — no timers/daemon.
 *
 * @param {object} input
 * @param {object} [options]
 * @param {string} [options.now] ISO now for createdAt stamp
 * @param {boolean} [options.demo]
 */
export function queryTaskSubscription(input, options = {}) {
  const normalized = unwrapInput(input);
  const now =
    typeof options.now === "string" && options.now.trim()
      ? options.now.trim()
      : new Date().toISOString();
  const demo = options.demo === true || normalized.demo === true;

  const skipped = [];
  const valid = [];
  for (let i = 0; i < normalized.updates.length; i++) {
    const result = tryNormalizeUpdate(normalized.updates[i], i);
    if (result.ok) valid.push(result.value);
    else skipped.push(result.skipped);
  }

  const scannedCount = normalized.updates.length;

  const matched = [];
  for (const update of valid) {
    const matchedFilters = matchUpdate(
      update,
      normalized.subscription,
      normalized.lastReadByTask,
    );
    if (matchedFilters == null) continue;
    matched.push({ ...update, matchedFilters });
  }

  matched.sort(stableCompare);

  let startIndex = 0;
  if (normalized.afterCursor != null) {
    const cursor = decodeCursor(normalized.afterCursor);
    if (Object.prototype.hasOwnProperty.call(cursor, "i")) {
      startIndex = cursor.i + 1;
    } else {
      const found = matched.findIndex((u) => u.id === cursor.id);
      if (found < 0) {
        // Cursor id not in current matched set — treat as resume after end
        // (empty page) rather than invalid, unless we want hard fail.
        // Spec: invalid cursor → throw. Unknown id in valid encoding is
        // still a valid cursor shape; resume past end.
        startIndex = matched.length;
      } else {
        startIndex = found + 1;
      }
    }
  }

  if (startIndex < 0) startIndex = 0;
  const page = matched.slice(startIndex, startIndex + normalized.limit);
  let nextCursor = null;
  if (page.length > 0 && startIndex + page.length < matched.length) {
    const lastAbsoluteIndex = startIndex + page.length - 1;
    nextCursor = encodeCursor({ i: lastAbsoluteIndex });
  }

  const status =
    skipped.length > 0 ? QUERY_STATUS.PARTIAL : QUERY_STATUS.READY;

  return {
    schema: SCHEMA,
    packageId: PACKAGE_ID,
    status,
    items: page,
    nextCursor,
    matchedCount: matched.length,
    scannedCount,
    skipped,
    pollingDaemon: false,
    execute: false,
    consumerInstructions: CONSUMER_INSTRUCTIONS,
    createdAt: now,
    demo,
    subscription: {
      capabilities: normalized.subscription.capabilities ?? null,
      deadlineBefore: normalized.subscription.deadlineBefore ?? null,
      deadlineAfter: normalized.subscription.deadlineAfter ?? null,
      unreadOnly: normalized.subscription.unreadOnly ?? null,
      taskIds: normalized.subscription.taskIds ?? null,
    },
    limit: normalized.limit,
    afterCursor: normalized.afterCursor,
  };
}
