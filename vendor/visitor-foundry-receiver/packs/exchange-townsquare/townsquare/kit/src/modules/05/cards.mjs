/**
 * buildAnswerCards — compact source-backed answer cards that preserve
 * missing or inaccessible sources (never invent sources).
 */
import {
  CARD_STATUS,
  CONSUMER_INSTRUCTIONS,
  ERROR_CODES,
  PACKAGE_ID,
  SCHEMA,
  SOURCE_STATUS,
} from "./constants.mjs";
import {
  cardsError,
  tryNormalizeAnswer,
  unwrapInput,
} from "./validate.mjs";

/**
 * @param {object} input
 * @param {{ now?: string, demo?: boolean }} [options]
 */
export function buildAnswerCards(input, options = {}) {
  const normalized = unwrapInput(input);
  const now =
    typeof options.now === "string" && options.now.trim()
      ? options.now.trim()
      : new Date().toISOString();
  const demo = options.demo === true || normalized.demo === true;

  const skipped = [];
  const cards = [];

  for (let i = 0; i < normalized.answers.length; i++) {
    const result = tryNormalizeAnswer(normalized.answers[i], i);
    if (result.ok) cards.push(result.value);
    else skipped.push(result.skipped);
  }

  if (cards.length < 1) {
    throw cardsError(
      ERROR_CODES.MISSING_REQUIREMENT,
      "no valid answers produced cards (all malformed or empty)",
      { skipped },
    );
  }

  let missingSourceCount = 0;
  let inaccessibleSourceCount = 0;
  for (const card of cards) {
    if (card.sourceStatus === SOURCE_STATUS.MISSING) missingSourceCount += 1;
    if (card.sourceStatus === SOURCE_STATUS.INACCESSIBLE) inaccessibleSourceCount += 1;
  }

  const status =
    skipped.length > 0 ? CARD_STATUS.PARTIAL : CARD_STATUS.READY;

  return {
    schema: SCHEMA,
    packageId: PACKAGE_ID,
    status,
    cards,
    skipped,
    missingSourceCount,
    inaccessibleSourceCount,
    execute: false,
    inventedSources: false,
    consumerInstructions: CONSUMER_INSTRUCTIONS,
    createdAt: now,
    demo,
  };
}
