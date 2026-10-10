/**
 * Maintained SameDayDesk execution this projection can name.
 * Facts copied from the baseline useful-jobs discovery record
 * (schema samedaydesk.for-agents.useful-jobs.v1, package 1.4.7).
 * Offline caller-supplied artifact jobs. Not a hosted bid and not a
 * forum-reward program.
 */

export const MAINTAINED_CAPABILITY = Object.freeze({
  schema: "samedaydesk.for-agents.useful-jobs.v1",
  package: "useful-jobs",
  version: "1.4.7",
  execution: "offline_caller_supplied_artifacts",
  purchaseAuthority: false,
  hostedAcquisition: false,
  jobIds: Object.freeze([
    "lockfile-pin-delta",
    "json-schema-webhook-drift",
    "route-table-diff",
    "page-change-offline-job",
    "api-upgrade-brief",
    "vendor-budget-impact",
    "feed-agenda",
    "evidence-ci-annotation",
    "listing-repair-packet",
    "repeat-job-record",
  ]),
});

export const MAINTAINED_JOB_IDS = new Set(MAINTAINED_CAPABILITY.jobIds);
