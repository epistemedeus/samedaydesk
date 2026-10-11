export const FEATURE = "codex/task-native-selection-211860";
export const PACKAGE_ID = "task-native-selection-211860";
export const USER_AGENT = "samedaydesk-task-native-selection/211860";

export const TASK_SCHEMA = "samedaydesk.task-native-selection.task.v1";
export const CATALOG_SCHEMA = "samedaydesk.task-native-selection.catalog.v1";
export const RESULT_SCHEMA = "samedaydesk.task-native-selection.result.v1";
export const FEEDBACK_SCHEMA = "samedaydesk.task-native-selection.feedback.v1";
export const EFFORT_SCHEMA = "samedaydesk.task-native-selection.effort.v1";
export const COVERAGE_SCHEMA = "samedaydesk.task-native-selection.coverage.v1";
export const RECEIPT_SCHEMA = "samedaydesk.original-task-receipt.v1";
export const MEASUREMENT_RULE = "pilot.observatory-measurement.v1";
export const DISCOVERY_SCHEMA = "samedaydesk.acquisition-discovery.v1";

export const TASK_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,80}$/;
export const DECIMAL_AMOUNT = /^(0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
export const INTEGER_AMOUNT = /^(0|[1-9][0-9]*)$/;
export const CURRENCY = /^[A-Z]{3}$/;

export const DEFAULT_ORIGINS = Object.freeze({
  openapi: "https://agents.samedaydesk.com/openapi.json",
  x402: "https://agents.samedaydesk.com/.well-known/x402.json",
  cards: "https://agents.samedaydesk.com/v0/cards.json",
  careersCold: "https://agents.samedaydesk.com/recipes/careers-board-cold",
  taskReadiness: "https://samedaydesk.com/discovery/task-readiness.json",
});

export const PORTFOLIO_HOSTS = Object.freeze([
  "samedaydesk.com",
  "agents.samedaydesk.com",
  "ein.llc",
  "neomorphic.io",
]);
