export const CONSUMER_FEATURE = "codex/task-native-useful-consumer-211879";
export const INPUT_SCHEMA = "samedaydesk.task-native-useful-consumer.input.v1";
export const JOURNEY_SCHEMA = "samedaydesk.task-native-useful-consumer.v1";
export const CONSUMER_MODULE = "tools/l08-agent-repair/lib/public-adapter.mjs";
export const PIN = "00267aeb03c3ce01b9b318f5ee0172aee34d7e34";
export const READINESS_ENTRY = "discovery:task-readiness";

// Specified from the owned pin fixtures and public-adapter decision line
// before the consumer is invoked. meaningId is not part of this check.
export const QUOTE_SUCCESS = Object.freeze({
  pointer: "data.quote",
  valuePattern: "^\\d+(\\.\\d+)?$",
  valuePatternEvaluatedBy: "not_invoked",
  method: "POST",
  route: "/quote",
  positiveFixture: "catalog-row-repair-complete.json",
  positiveRelative: "action/fixtures/catalog-row-repair-complete.json",
  negativeFixture: "catalog-row-repair-add-required.json",
  negativeRelative: "action/fixtures/catalog-row-repair-add-required.json",
  positive: Object.freeze({
    id: "repair-complete",
    ok: true,
    findings: Object.freeze([]),
    decision: "admissible",
    repairComplete: true,
    repairActions: Object.freeze([]),
    paymentSent: false,
    paymentSigned: false,
    credentialsUsed: false,
  }),
  negative: Object.freeze({
    id: "repair-add-required",
    ok: false,
    findings: Object.freeze(["seller_response_required_path_missing:data.quote"]),
    decision: "admissible",
    repairComplete: false,
    repairActions: Object.freeze(["add_property_to_required"]),
    paymentSent: false,
    paymentSigned: false,
    credentialsUsed: false,
  }),
});
