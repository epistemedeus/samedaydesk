import { SDS52_PIN, STATUSES, TICKET_SCHEMA } from "./pins.mjs";
import { OUTCOME_KIND } from "./outcomes.mjs";

export const DESK_CONTRACT = Object.freeze({
  schema: "samedaydesk.job-request-desk.contract.v1",
  ticketSchema: TICKET_SCHEMA,
  statuses: STATUSES,
  outcomeKinds: Object.freeze(Object.values(OUTCOME_KIND)),
  testedSds52: SDS52_PIN,
  integrationOwner: "W5-D01",
  remainingBinding:
    "D01 may amend server/paid-useful-jobs after this pin. This adapter tests aeef964fa188443078958d9d6d393afae1d542ee and does not claim a later D01 head.",
  replay: Object.freeze({
    queuedResumes: true,
    rejectedStaysRejected: true,
    isolatedResultDir: "store/results/<64-hex-requestId>",
  }),
  sold: false,
  purchaseAuthority: false,
});
