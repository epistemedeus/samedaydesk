export const D01_SHA = "5579cfde782a060de42420ac904fe45372227ce8";
export const D01_BRANCH = "codex/w5-d01-20260911";
export const D01_PR = 74;
export const ARCHIVE_CORE_SHA = "d2a0d0b2798e9a3951c43fe16dd64215207c3d9b";
export const H04_CORPUS_SHA = "7026dc9ad4bc9bef6c68cf0654fff5a6d2c54bbc";
export const H04_PACKAGED_EXAMPLES_SHA = "37dd4b42cf21dc2031715971971bb2426a7beb80";

export const ARCHIVE_110 = {
  name: "useful-jobs-1.1.0",
  publicPath: "client/public/for-agents/useful-jobs/useful-jobs-1.1.0.tar.gz",
  bytes: 2577606,
  sha256: "de8ebee19ffd5d9019fa7988291fe37d861e7bf3f5ee7dd341c9d2f0f0065534",
  command: ["node", "bin/useful-jobs.mjs"],
};

export const ARCHIVE_100 = {
  name: "useful-jobs-1.0.0",
  publicPath: "client/public/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz",
  bytes: 2522418,
  sha256: "6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51",
};

export const TEN_JOBS = [
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
];

export const SIX_JOBS_100 = [
  "api-upgrade-brief",
  "vendor-budget-impact",
  "feed-agenda",
  "evidence-ci-annotation",
  "listing-repair-packet",
  "repeat-job-record",
];

export const ADVERTISED_OUTPUTS = {
  "lockfile-pin-delta": ["pin-delta.json", "pin-delta.md"],
  "json-schema-webhook-drift": ["drift-brief.json", "drift-brief.md"],
  "route-table-diff": ["route-diff.json", "route-diff.md"],
  "page-change-offline-job": ["page-change.json", "page-change.md"],
  "api-upgrade-brief": ["upgrade-brief.json", "upgrade-brief.md"],
  "vendor-budget-impact": ["budget-impact.json", "budget-impact.md"],
  "feed-agenda": ["agenda.json", "agenda.ics"],
  "evidence-ci-annotation": ["annotations.json", "annotations.md"],
  "listing-repair-packet": ["repair-packet.json", "repair-packet.md"],
  "repeat-job-record": ["repeat-job.json", "repeat-job.md"],
};

export const H04_EXTRA = {
  "h04-pub-lock-02": {
    before: "experiments/wave5-heavy/h04/examples/lockfile-public/set-a/h04-pub-lock-02/before.json",
    after: "experiments/wave5-heavy/h04/examples/lockfile-public/set-a/h04-pub-lock-02/after.json",
    note: "resolved-url http to https; not packaged in 1.1.0 archive",
  },
  "h04-pub-lock-03": {
    before: "experiments/wave5-heavy/h04/examples/lockfile-public/set-a/h04-pub-lock-03/before.json",
    after: "experiments/wave5-heavy/h04/examples/lockfile-public/set-a/h04-pub-lock-03/after.json",
    note: "dependency addition; not packaged in 1.1.0 archive",
  },
  "h04-page-02": {
    job: "experiments/wave5-heavy/h04/examples/page-facts/h04-page-02/job.json",
    before: "experiments/wave5-heavy/h04/examples/page-facts/h04-page-02/before.json",
    after: "experiments/wave5-heavy/h04/examples/page-facts/h04-page-02/after.json",
    note: "title/description/headings unchanged across footer-only HTML noise",
  },
};
