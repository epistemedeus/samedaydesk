export const PUBLIC_SCHEMA = "samedaydesk.composed-machine-delivery.public.v1";
export const REQUEST_SCHEMA = "samedaydesk.composed-machine-delivery.request.v1";
export const RETAINED_SCHEMA = "samedaydesk.composed-retained-capture.v1";
export const RECEIPT_SCHEMA = "samedaydesk.composed-delivery-receipt.v1";
export const JOURNAL_SCHEMA = "samedaydesk.composed-delivery-journal.v1";
export const MANIFEST_SCHEMA = "samedaydesk.composed-machine-delivery.manifest.v1";

export const CAPTURE_SCHEMA = "samedaydesk.recurring-decision-permitted-capture.v1";
export const BASE_SOURCE = "c60641e8ff2b94dd704307e57f5b6fe789ba0df7";
export const EXISTING_FEE_BPS = 500;
export const EXISTING_FEE_BASIS = "new_job_gross";

export const DIRECT_REPEAT_FITTING = "node tools/task-repeat-use/cli.mjs walk --case fitting";
export const DIRECT_REPEAT_NONFITTING = "node tools/task-repeat-use/cli.mjs walk --case nonfitting-capture";
export const DIRECT_DECISIONS = "node tools/recurring-decision-consumer/cli.mjs recur --capture <capture.json> --intents <intents.json> --priors <priors.json> --schedule <schedule.json> --clock <ISO-UTC> --horizon <hours>";
export const DIRECT_PREVIEW = "node tools/result-reuse/cli.mjs preview --input <result.json> --task-id <id> --subject <id> --sequence <n> --clock <ISO-UTC>";
export const DIRECT_WORK = "node tools/two-sided-work-consumer/cli.mjs";

export const NEED_TO_CONSUMER = Object.freeze({
  "local-process": "native",
  "mcp-tool": "mcp",
  "unpublished-review": "review",
});

export const BLOCKED_NEEDS = Object.freeze(["ghost", "dify", "n8n", "dify-table-csv"]);

export const OWNED_ACTOR = Object.freeze({
  actorId: "owned-test-recorder",
  party: "owned_test",
});
