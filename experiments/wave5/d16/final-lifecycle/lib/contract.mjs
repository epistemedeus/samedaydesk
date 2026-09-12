/**
 * W5-D16 final-input lifecycle check of the release candidate.
 * Not a second job kernel. D01 owns product. This directory only records process/output truth.
 */
export const SCHEMA = "samedaydesk.wave5.d16.final-lifecycle.v1";

export const PINNED_IMPLEMENTATION = Object.freeze({
  repo: "epistemedeus/samedaydesk",
  d01Pr: 74,
  d01Sha: "46f2b7f55a7fb780333073a5197b64b8fde64a33",
  publicPr: 114,
  publicSha: "9ae0febd8c184c0cbbb5e481ba31ac620e89b869",
  archive: "client/public/for-agents/useful-jobs/useful-jobs-1.2.0.tar.gz",
  archiveSha256: "dec31ea66f1605fb9578c7d15c9583b130c6e2c0b82b5e6b93422381a04461eb",
  archiveBytes: 2579117,
  publicCli: "bin/useful-jobs.mjs",
  wrapper: "server/paid-useful-jobs",
  m01Adapter: "experiments/wave5/m01/lib/d01-adapter.mjs",
  contract: "samedaydesk.paid-useful-jobs.execution.v1",
});

export const INTEGRATION_OWNER = "W5-D01";

export const FOUR_NEW = Object.freeze([
  "lockfile-pin-delta",
  "json-schema-webhook-drift",
  "route-table-diff",
  "page-change-offline-job",
]);

export const COMPAT_ORIGINAL_SIX = "vendor-budget-impact";

export const FINDING_IDS = Object.freeze({
  PUBLIC_CLI_NESTED_ORPHAN: "public-cli-nested-hang-orphan",
  LOCKFILE_PARTIAL_MIX: "lockfile-partial-write-mixes-generations",
  M01_TIMEOUT_MISLABEL: "m01-adapter-timedOut-hardcoded-false",
});
