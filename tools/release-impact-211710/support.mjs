// One accepted repair, not a registry or an applicability authority.
export const SUPPORT = Object.freeze({
  repairId: "sds301-archive-refusal-exit",
  repository: "epistemedeus/samedaydesk",
  repairRef: "5713db0158281e7ae61ba84bf86beb92b27de664",
  acceptedBlob: "e068d9974840cfe680a3f66964d3d88a5cf47141",
  acceptedSha256: "54cb3b33096f3972f81b2badd3a70d10da4c0c1560ce128d5d07467bc14cedb1",
  sourcePath: "experiments/s260-useful-jobs-public-integration/bin/obtain-archive.mjs",
  manifestPath: "package.json",
  predicate: "Archive argument, source, HTTP status, size, digest or extraction refusal returns structured ok:false and exit 1; valid acquisition returns exit 0. Size/digest/status refusal does not extract or execute the archive, and a shell success branch does not continue.",
  fields: ["sourceBlob", "node", "tar", "nodeRequirement"],
  dependencies: ["node", "tar"],
  normalCommand: ["npm", "run", "test:useful-jobs-public"],
  priorReceipt: {
    repository: "epistemedeus/pilot",
    ref: "91db1cc3d9b678dcbe4e7956a7166541c06ca86f",
    path: "overview/research/phase-20261010/current-remaining-outcomes-126020/ROOT-RECEIVING-126030.md",
  },
});
export const INSTALLED_SCHEMA = "samedaydesk.release-impact-211710.installed.v1";
export const OBSERVATION_SCHEMA = "samedaydesk.release-impact-211710.source-observation.v1";
export const RESULT_SCHEMA = "samedaydesk.release-impact-211710.result.v1";
