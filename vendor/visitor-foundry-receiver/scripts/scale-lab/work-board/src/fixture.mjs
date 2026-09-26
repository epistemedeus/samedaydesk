/**
 * Portable seed fixtures for the S02 work/bounty board.
 * Demonstration rows are unfunded and labelled. External rows link out only.
 */

import {
  CLOCK_DOMAIN_FIXTURE,
  FUNDING_CLASS,
  JOB_STATUS,
  SCHEMA,
} from "./constants.mjs";

const T0 = "2026-09-09T12:00:00.000Z";
const T1 = "2026-09-09T12:05:00.000Z";

export const FIXTURE_LABEL = "fictional-work-board-demo";

export function createSeedBoard() {
  return {
    schema: SCHEMA,
    label: FIXTURE_LABEL,
    disclaimer:
      "All demonstration jobs on this board are fictional local fixtures. They are unfunded, not escrowed, and not evidence of customers, awards, or a hosted marketplace. External opportunities are links only.",
    clockDomain: CLOCK_DOMAIN_FIXTURE,
    createdAt: T0,
    jobs: [
      {
        id: "job_demo_page_diff",
        title: "DEMONSTRATION: Diff a public docs page after a provider change",
        brief:
          "Demonstration only (unfunded). Produce a bounded before/after note for one public HTTPS docs URL after a labelled provider change. Do not fetch credentials or invent customers.",
        deliverableContract:
          "Return a JSON note with fields: sourceUrl (https), observedAt (ISO-8601), changed (boolean), summary (<=500 chars), evidenceDigest (sha256 hex or null). No payment authorization. No escrow.",
        acceptanceEvidence: [
          "Artifact URL is https and opens without credentials",
          "changed is boolean and summary names the exact section observed",
          "Note states fundingClass=demonstration and does not claim a reward",
        ],
        fundingClass: FUNDING_CLASS.demonstration,
        label: "demonstration · unfunded · fictional",
        status: JOB_STATUS.open,
        version: 1,
        correspondenceProjectHint: "prj_work_board_demo_page_diff",
        createdAt: T0,
        updatedAt: T0,
      },
      {
        id: "job_demo_receipt_check",
        title: "DEMONSTRATION: Check a public lab receipt shape",
        brief:
          "Demonstration only (unfunded). Validate that a public lab receipt JSON declares evidenceClass and doesNotEstablish. Correction journey allowed if a prior agent overstated demand.",
        deliverableContract:
          "Return a JSON checklist: receiptUrl, evidenceClass, establishesCount, doesNotEstablishCount, overclaimFound (boolean). Artifact required. No custody.",
        acceptanceEvidence: [
          "Checklist cites the exact public receipt URL",
          "overclaimFound is false unless a real field invents external demand",
          "Any correction names the prior completion id it supersedes",
        ],
        fundingClass: FUNDING_CLASS.demonstration,
        label: "demonstration · unfunded · fictional",
        status: JOB_STATUS.open,
        version: 1,
        correspondenceProjectHint: "prj_work_board_demo_receipt",
        createdAt: T0,
        updatedAt: T0,
      },
      {
        id: "job_external_public_receipt",
        title: "External link: public lab receipt observation",
        brief:
          "Real externally linked pointer only (public Neomorphic lab receipt). This board does not host awards, custody, or escrow. Treat the link as the source of truth; do not treat this row as a funded Neomorphic bounty.",
        deliverableContract:
          "If you participate, inspect the external HTTPS document under its published terms. Neomorphic may later record a local observation through correspondence; this board row is not payment authority.",
        acceptanceEvidence: [
          "Work references the external link, not an in-board payout",
          "Any local completion is labelled as an observation of external material",
        ],
        fundingClass: FUNDING_CLASS.external,
        label: "external opportunity · link only · no custody",
        externalLink: "https://neomorphic.io/api/receipts/lab-release-2026-09-01.json",
        status: JOB_STATUS.open,
        version: 1,
        correspondenceProjectHint: null,
        createdAt: T1,
        updatedAt: T1,
      },
    ],
    proposals: [],
    completions: [],
    corrections: [],
    events: [],
  };
}

/** Fixture packet for CLI/agent import-export roundtrips. */
export function createPortableFixturePacket() {
  const seed = createSeedBoard();
  return {
    schema: SCHEMA,
    kind: "work-board-fixture-packet",
    label: FIXTURE_LABEL,
    exportedAt: T1,
    board: seed,
  };
}
