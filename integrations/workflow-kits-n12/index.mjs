/**
 * SameDayDesk workflow-kits-n12: package entry. Import only from here.
 */
export { PERIOD_INPUT_KIND, PERIOD_RESULT_KIND, PERIOD_FIELDS, createKitEffects, runPeriod, stablePeriod } from "./src/period-map.mjs";
export { WORKFLOW_REQUEST_KIND, buildWorkflowRequest, fromWorkflowRequest } from "./src/workflow-request.mjs";
export { MAKE_MODULE_IDS, fromMakeExecution, fromMakeRequest } from "./src/make-adapter.mjs";
export { N8N_NODE_NAMES, fromN8nExecution, fromN8nRequest } from "./src/n8n-adapter.mjs";
export { SCHEMA_ADAPTERS, applyDeclaredSchemaAdapter } from "./src/schema-adapters.mjs";
export { EXIT_STATES, FLOWASSERT_PIN, mapExit, runFlowAssertCli, runPackagedCheck, withFlowAssert } from "./src/flowassert-bridge.mjs";
export { createClientEndpoint } from "./src/client-endpoint.mjs";
export { COMPARISON_COLUMNS, COMPARISON_ROWS } from "./src/vendor-paths.mjs";
