import {
  DEFAULT_LIMITS,
  ENGINE_ID,
  ENGINE_VERSION,
  ERROR_CODES,
  EXTRACT_PRODUCT,
  EXTRACT_SCHEMA,
  REPORT_SCHEMA,
  SUPPORTED_FIELDS,
  TERMS_SCHEMA,
  TERMS_VERSION_PREFIX,
} from "./constants.mjs";

/** Small public request/result contract. Consumers bind this, not a future sibling. */
export const PAGE_CHANGE_OFFLINE_CONTRACT = Object.freeze({
  schema: "samedaydesk.page-change-offline-job.contract.v1",
  engine: ENGINE_ID,
  engineVersion: ENGINE_VERSION,
  reportSchema: REPORT_SCHEMA,
  digestSchema: "pilot/change-digest/v1",
  extractProduct: EXTRACT_PRODUCT,
  extractSchema: EXTRACT_SCHEMA,
  termsSchema: TERMS_SCHEMA,
  termsVersionPrefix: TERMS_VERSION_PREFIX,
  cli: "bin/page-change.mjs",
  commands: Object.freeze(["compare", "job", "journey"]),
  supportedFields: SUPPORTED_FIELDS,
  defaultLimits: DEFAULT_LIMITS,
  analysisVerdicts: Object.freeze([
    "unchanged",
    "changed",
    "reordered",
    "incomplete",
    "ambiguous",
    "incomparable",
  ]),
  refusalCodes: Object.freeze(Object.values(ERROR_CODES)),
  transport: Object.freeze({
    successExit: 0,
    refusalExit: 2,
    note: "exit 0 carries an analysis verdict including incomplete; exit 2 is refusal or input failure",
  }),
});
