/**
 * SameDayDesk workflow-kits-n12-changed-period: package entry. Import only from here.
 */
export { REGISTRY_SCHEMA, TARGETS, SOURCE_TYPES, validateMappingRegistry, findMapping, diffRecordShape, mapRecord } from "./src/mapping.mjs";
export { KIT_CODES, kitException, journeyException, suggestedActionFor } from "./src/exceptions.mjs";
export { RECEIPT_KIND, createApplyReceipts, ledgerKeyOf } from "./src/ledger.mjs";
export { CLIENT_ENDPOINT, REQUEST_KIND, RESULT_KIND, PLATFORMS, OUTCOMES, createChangedPeriodEndpoint, journeyFieldPath, summarize } from "./src/client-endpoint.mjs";
export { simulateMake, simulateN8n } from "./src/simulate.mjs";
export { runDirectPeriod } from "./src/direct-route.mjs";
export { runNativeControl } from "./src/native-control.mjs";
export { ROUTES, STEPS, runScenario } from "./src/scenario.mjs";
export { SCENARIO_CLOCK, SCENARIO_FAULTS, mappingRegistry, periodNRequest, periodNPlus1Request, journeyOwedReference } from "./src/fixtures.mjs";
export { KIT_ARTIFACTS, artifactDigests, kitPath } from "./src/artifacts.mjs";
export { COMPARISON_ROWS } from "./src/vendor-paths.mjs";
