export {
  PACKAGE_ID,
  SCHEMA,
  SUMMARY_STATUS,
  ENTRY_ROLE,
  ERROR_CODES,
  FORBIDDEN_FIELDS,
  REUSE_FROM,
  CONSUMER_INSTRUCTIONS,
} from "./constants.mjs";

export {
  isPlainObject,
  summaryError,
  assertNoForbidden,
  unwrapInput,
  normalizeClaim,
  normalizeCorrection,
  assertAcyclicSupersession,
  normalizeStanceKey,
} from "./validate.mjs";

export { buildContradictionPreservingSummary } from "./summary.mjs";
