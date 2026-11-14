/**
 * Exact parent refs for the recurring record-to-accepted-output journey.
 * These are citations, not a local store of tasks, terms, or results.
 */
export const PARENT_REFS = Object.freeze({
  jobContractHead: {
    repo: "epistemedeus/pilot",
    sha: "fb8228a90a3f12221451ab27a3c9dc9eccc5ab6e",
    pull: 682,
    branch: "codex/n12-useful-commerce-job-contracts-20261112",
    path: "tools/payment-rail/job-contract/",
  },
  assignmentPin: {
    repo: "epistemedeus/pilot",
    sha: "a243f12b1dde8ce172b09945ee15d23aecdd986e",
    note: "Assignment-pin correction. 962ac8cda11d43b7c2c26e06da6d2b4044b20dd1 is the earlier client-route revision, not the assignment pin.",
  },
  adjudicationPin: {
    repo: "epistemedeus/pilot",
    sha: "0d9eed5f7b949f71767724cbf3d72ac55ad3dbb2",
    path: "overview/self-evaluations/2026-11-12-participant-economy/INTEGRATED-DECISIONS.md",
    revision: 2,
    note: "Assignments are taken only from INTEGRATED-DECISIONS revision 2. The Useful Commerce programme is unchanged.",
  },
  cliPlanRef: {
    repo: "epistemedeus/pilot",
    sha: "c64ad7bcd84b91add5e2eed621bc70bdbb41c026",
    path: "overview/self-evaluations/2026-11-12-participant-economy/THREE-SITE-AGENT-CLI-PLAN.md",
  },
  workExchangePr463: {
    repo: "epistemedeus/neomorphic-io",
    pull: 463,
    sha: "ab7a3a0552e07ef5055ce48b442d7c0ee96bbaad",
    branch: "codex/n12-work-exchange-20261112",
    contractPath: "services/work-exchange/INTEGRATION.md",
    examplePath: "services/work-exchange/examples/recurring-job.mjs",
    fixturePath: "services/work-exchange/fixtures/two-agent-journey.json",
    hashTermsVersionPath: "packs/earned-work-sdk/src/terms-hash.mjs",
    hashTermsVersionBlob: "90dbbb241265da0ee99dea3ae809810a95de3214",
    documentedAs: "@neomorphic/funded-task-terms/hash#hashTermsVersion",
    note: "Caller source for termsVersion authority. 585c80b91a15d7cf6fd97a5afc085d246efead7d was an earlier head of the same branch, not the current caller source.",
  },
  workExchangeReceipt: {
    repo: "epistemedeus/pilot-heavy-relay",
    sha: "98f561e1ab3f75478da08f711b37af8fc9f04562",
    path: "control/plan/N12-PARTICIPANT-ECONOMY/WORK-EXCHANGE/",
  },
  agentEntryPr273: {
    repo: "epistemedeus/x402-url-extractor",
    pull: 273,
    sha: "6c8edfd755d8e254659d9f8357c123c8da36bd44",
    earlierCommit: "578396b62df736db397d33826e627071875e864d",
    moduleVersion: "1.1.0",
    contractPath: "packages/task-continuation/CONTRACT.md",
  },
  agentEntryReceipt: {
    repo: "epistemedeus/pilot-heavy-relay",
    sha: "3007012257ef1ca6adf75e0fa26afffde60124a7",
    path: "control/plan/N12-PARTICIPANT-ECONOMY/AGENT-ENTRY/",
    callerExamples: "control/plan/N12-PARTICIPANT-ECONOMY/AGENT-ENTRY/CALLER-EXAMPLES.md",
  },
  ingestionStore: {
    repo: "epistemedeus/samedaydesk",
    sha: "32437117e5232480b18349721069b2a8a0fc2a2c",
    path: "tools/recurring-decision-consumer/",
    evaluateBlob: "6afe9e65e91c2e38305f36f2caa094c1184c8bfb",
    captureSchema: "samedaydesk.recurring-decision-permitted-capture.v1",
    intentSchema: "samedaydesk.recurring-decision-intent.v1",
  },
  resultsStore: {
    repo: "epistemedeus/samedaydesk",
    sha: "32437117e5232480b18349721069b2a8a0fc2a2c",
    path: "tools/result-reuse/",
    exportBlob: "32bd69a27f03b12351112c9958c032389e372818",
    portableBlob: "9713e7c4a55fd712264582734592f84afc631449",
  },
});

export const CAPTURE_SCHEMA = "samedaydesk.recurring-decision-permitted-capture.v1";
export const INTENT_SCHEMA = "samedaydesk.recurring-decision-intent.v1";
export const JOURNEY_SCHEMA = "job-recurring-journey-result.v1";
export const N8N_EQUIVALENT_NODE = "Shape Capture Fields";
export const DEFAULT_HORIZON_HOURS = 24;
export const CORRELATION_ID_RE = /^ae:corr:v1:[A-Za-z0-9_-]{22}$/;
export const TOKEN_SHAPED_RE = /^(pc1|tc1)\.|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./;
export const TASK_ID_RE = /^[A-Za-z0-9._:-]{1,120}$/;
export const CONTEXT_ID_RE = /^[A-Za-z0-9._:-]{8,120}$/;
