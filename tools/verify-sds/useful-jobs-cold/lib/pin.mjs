/** Useful-jobs 1.4.7 cold pin (cite W0-B2 / PR148 catalog; write only here). */
export const FEATURE = "useful-jobs-cold";

export const USEFUL_JOBS_PIN = Object.freeze({
  version: "1.4.7",
  sha256: "e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec",
  bytes: 5255824,
  rootName: "useful-jobs-1.4.7",
  archive: "useful-jobs-1.4.7.tar.gz",
  kitArchive: "client/public/kit/useful-jobs-1.4.7.tar.gz",
  publicArchive: "client/public/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz",
  obtainArchiveBin: "experiments/s260-useful-jobs-public-integration/bin/obtain-archive.mjs",
  cli: "bin/useful-jobs.mjs",
});

/** Wrong-digest seed: 64 hex zeros (never the real pin). */
export const WRONG_SHA = "0".repeat(64);

/** Wrong-bytes seed: off-by-one from pin bytes. */
export const WRONG_BYTES = USEFUL_JOBS_PIN.bytes - 1;

export const SEEDED = Object.freeze({
  "wrong-sha": Object.freeze({
    id: "wrong-sha",
    expectCode: "wrong-digest",
    remap: true,
  }),
  "wrong-bytes": Object.freeze({
    id: "wrong-bytes",
    expectCode: "wrong-size",
    remap: true,
  }),
  "sha-mismatch": Object.freeze({
    id: "sha-mismatch",
    expectCode: "wrong-digest",
    remap: true,
    aliasOf: "wrong-sha",
  }),
});

export const W0B2_CITE = Object.freeze({
  pr: 148,
  branch: "heavy/w0-b2-verify-sds",
  patterns: [
    "tools/verify/lib/archive.mjs (obtainArgv + remapRefuse child exit 0 → verifier ≠0)",
    "tools/verify/lib/catalog.mjs USEFUL_JOBS_PIN 1.4.7",
  ],
  note: "cite-only; do not edit tools/verify/**",
});
