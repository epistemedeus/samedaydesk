export {
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
export { encodeCursor, decodeCursor, townError } from "./cursor.mjs";
export {
  assertBoundedText,
  assertId,
  assertTrustLabel,
  clampLimit,
  markHostileAsData,
  refuseCredentialFields,
  safeEvidenceHref,
  sanitizeEvidence,
  setText,
  clone,
} from "./trust.mjs";
export { TownSquareBoard, createTownSquareBoard } from "./board.mjs";
export { createFixtureSeed, FIXTURE_LABEL } from "./fixture.mjs";
export { loadTaskMemoryContract, loadTaskMemoryContractSync } from "./contract.mjs";

import { createTownSquareBoard } from "./board.mjs";
import { createFixtureSeed } from "./fixture.mjs";
import { TRUST } from "./constants.mjs";

export function createFixtureTownSquare(options = {}) {
  return createTownSquareBoard({
    seed: createFixtureSeed(),
    ...options,
  });
}

export function createContractBackedTownSquare({ parseObservation, assertLineage, seed = null } = {}) {
  return createTownSquareBoard({
    seed: seed || createFixtureSeed(),
    parseObservation,
    assertLineage,
  });
}

export { TRUST as TownSquareTrust };
