import { STATUSES, TICKET_SCHEMA, CURRENT_RUNTIME_PIN, SDS52_HISTORICAL_PIN } from "./pins.mjs";
import { EXECUTION_CONTRACT_VERSION } from "./current.mjs";
import { OUTCOME_KIND } from "./outcomes.mjs";

export const DESK_CONTRACT = Object.freeze({
  schema: "samedaydesk.job-request-desk.contract.v1",
  ticketSchema: TICKET_SCHEMA,
  statuses: STATUSES,
  outcomeKinds: Object.freeze(Object.values(OUTCOME_KIND)),
  executionContract: EXECUTION_CONTRACT_VERSION,
  testedCore: CURRENT_RUNTIME_PIN,
  testedSds52: CURRENT_RUNTIME_PIN,
  historicalSds52: SDS52_HISTORICAL_PIN,
  catalogVersion: "1.4.4",
  integrationOwner: "CW62",
  remainingBinding:
    "Consumes samedaydesk.paid-useful-jobs.execution.v1 at integration c6f1464 (repair 080cc62). Unpublished 1.4.4 candidate includes wrapper publication/interrupt overlay. Immutable 1.4.3 archive identity 8a811bba / a18ab918 does not contain wrapper.mjs and is not labeled fixed. vendor-budget-impact uses the 1.0.0 wrapper archive; M01 jobs use source-identity pins. HTTP execution cache is process-local.",
  replay: Object.freeze({
    queuedResumes: true,
    rejectedStaysRejected: true,
    unknownDoesNotRetry: true,
    isolatedResultDir: "store/results/<64-hex-requestId>",
  }),
  sold: false,
  purchaseAuthority: false,
  usefulPaidWork: false,
});
