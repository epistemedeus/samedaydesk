/**
 * exportConversationContext — portable thread→task conversation export with
 * explicit instruction/data separation, bounded size, and continuation pointers.
 */
import {
  CONSUMER_INSTRUCTIONS,
  EXPORT_STATUS,
  PACKAGE_ID,
  REUSE_FROM,
  SCHEMA,
} from "./constants.mjs";
import {
  makeContinuationPointer,
  messagePayloadByteSize,
  tryNormalizeMessage,
  unwrapInput,
} from "./validate.mjs";

/**
 * @param {object} input
 * @param {{ now?: string, demo?: boolean, maxBytes?: number, maxMessages?: number }} [options]
 */
export function exportConversationContext(input, options = {}) {
  const base = isPlainObject(input) ? { ...input } : input;
  // Options may override budget caps without mutating caller input
  if (options && typeof options.maxBytes === "number") {
    base.maxBytes = options.maxBytes;
  }
  if (options && typeof options.maxMessages === "number") {
    base.maxMessages = options.maxMessages;
  }

  const normalized = unwrapInput(base);
  const now =
    typeof options.now === "string" && options.now.trim()
      ? options.now.trim()
      : new Date().toISOString();
  const demo = options.demo === true || normalized.demo === true;

  const { threadId, taskId, maxBytes, maxMessages } = normalized;

  // Empty messages → ready with empty included + no continuation
  if (normalized.messages.length === 0) {
    return {
      schema: SCHEMA,
      packageId: PACKAGE_ID,
      status: EXPORT_STATUS.READY,
      threadId,
      taskId,
      included: [],
      skipped: [],
      continuation: null,
      truncated: false,
      byteSize: 0,
      maxBytes,
      maxMessages,
      execute: false,
      instructionsAreData: true,
      consumerInstructions: CONSUMER_INSTRUCTIONS,
      reuseFrom: REUSE_FROM,
      createdAt: now,
      demo,
    };
  }

  const skipped = [];
  const normalizedMsgs = [];

  for (let i = 0; i < normalized.messages.length; i++) {
    const result = tryNormalizeMessage(normalized.messages[i], i);
    if (result.ok) normalizedMsgs.push(result.value);
    else skipped.push(result.skipped);
  }

  // Chronological include from start until budget (oldest-first)
  const included = [];
  let byteSize = 0;
  let stopIndex = normalizedMsgs.length; // exclusive end of included range

  for (let i = 0; i < normalizedMsgs.length; i++) {
    if (included.length >= maxMessages) {
      stopIndex = i;
      break;
    }
    const msg = normalizedMsgs[i];
    const cost = messagePayloadByteSize(msg);
    if (byteSize + cost > maxBytes) {
      stopIndex = i;
      break;
    }
    included.push(msg);
    byteSize += cost;
  }

  const remaining = normalizedMsgs.slice(stopIndex);
  const truncated = remaining.length > 0;
  let continuation = null;
  if (truncated) {
    continuation = {
      remainingMessageIds: remaining.map((m) => m.id),
      nextOffset: stopIndex,
      pointer: makeContinuationPointer(threadId, stopIndex),
    };
  }

  const status =
    skipped.length > 0 ? EXPORT_STATUS.PARTIAL : EXPORT_STATUS.READY;

  return {
    schema: SCHEMA,
    packageId: PACKAGE_ID,
    status,
    threadId,
    taskId,
    included,
    skipped,
    continuation,
    truncated,
    byteSize,
    maxBytes,
    maxMessages,
    execute: false,
    instructionsAreData: true,
    consumerInstructions: CONSUMER_INSTRUCTIONS,
    reuseFrom: REUSE_FROM,
    createdAt: now,
    demo,
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
