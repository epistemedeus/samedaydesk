import { SCHEMA_CARD_A3, SCHEMA_CARD_F03 } from "./constants.ts";
import type { JobCard } from "./types.ts";

export function unwrapCard(payload: unknown): JobCard {
  if (!payload || typeof payload !== "object") {
    throw new Error("job card must be an object");
  }
  const root = payload as Record<string, unknown>;
  if (root.labelled && root.inner && typeof root.inner === "object") {
    return unwrapCard(root.inner);
  }
  if (root.schema === SCHEMA_CARD_A3 || root.schema === SCHEMA_CARD_F03 || root.listing || root.source) {
    return payload as JobCard;
  }
  if (root.data && typeof root.data === "object") {
    return unwrapCard(root.data);
  }
  throw new Error("unrecognized job card shape");
}

export function cardId(card: JobCard): string | null {
  return card.listing?.id || card.source?.nativeId || null;
}
