/**
 * Single correspondence event vocabulary for Scale experiments.
 * Mirrors services/correspondence EVENT_KINDS — do not invent a second set.
 */

export const EVENT_KINDS = Object.freeze({
  request: "request",
  reply: "reply",
  artifact: "artifact",
  correction: "correction",
  needs_human: "needs_human",
  resolved: "resolved",
  reopened: "reopened",
});

export const EVENT_KIND_LIST = Object.freeze(Object.values(EVENT_KINDS));

export function isCorrespondenceKind(kind) {
  return EVENT_KIND_LIST.includes(kind);
}
