#!/usr/bin/env node
/**
 * Write public discovery JSON from the live kit + machineEntry cold-start.
 * Keeps install/coldStart identical to USEFUL_JOBS_COLD_START.
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import KIT from "../../../../client/src/data/usefulJobsKit.json" with { type: "json" };
import {
  SITE_ORIGIN,
  USEFUL_JOBS_ACQUIRE_TOOLS,
  USEFUL_JOBS_COLD_START,
  USEFUL_JOBS_DESCRIPTION,
  USEFUL_JOBS_INSTALL,
  USEFUL_JOBS_RELEASE_NOTE,
  USEFUL_JOBS_RUNTIME,
} from "../../../../client/src/data/machineEntry.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");
const out = resolve(root, "client/public/discovery/useful-jobs.json");

const discovery = {
  schema: "samedaydesk.for-agents.useful-jobs.v1",
  package: "useful-jobs",
  version: KIT.version,
  title: "Offline useful jobs package",
  summary: USEFUL_JOBS_DESCRIPTION,
  page: `${SITE_ORIGIN}/for-agents/useful-jobs`,
  archiveUrl: `${SITE_ORIGIN}${KIT.archive}`,
  archive: {
    path: KIT.archive,
    url: `${SITE_ORIGIN}${KIT.archive}`,
    kitPath: KIT.kitArchive,
    sha256: KIT.sha256,
    bytes: KIT.bytes,
  },
  previous: KIT.previous,
  immutableArchives: KIT.immutableArchives,
  sha256: KIT.sha256,
  bytes: KIT.bytes,
  node: KIT.node,
  offline: true,
  purchaseAuthority: false,
  paidHostedClaim: false,
  schedulerDaemon: false,
  jobsCatalogUrl: `${SITE_ORIGIN}${KIT.catalog}`,
  jobsOutcomesUrl: `${SITE_ORIGIN}${KIT.outcomes}`,
  pins: {
    sourceRepo: KIT.sourceRepo,
    sourceCommit: KIT.sourceCommit,
    archiveFreeze: KIT.archiveFreeze,
    reviewedSource: KIT.reviewedSource,
  },
  releaseScope: {
    kind: "public-offline-promotion",
    approvedVersion: KIT.version,
    repairSource: KIT.sourceCommit,
    newlyReviewedJobIds: [...KIT.newlyReviewedJobIds],
    inheritedJobIds: [...KIT.inheritedJobIds],
    hostedAcquisition: false,
    neverPublishedAsPublicDownloads: ["1.4.1", "1.4.2", "1.4.3", "1.4.4", "1.4.5", "1.4.6"],
  },
  jobs: [...KIT.jobs],
  install: [...USEFUL_JOBS_INSTALL],
  coldStart: USEFUL_JOBS_COLD_START,
  acquireTools: [...USEFUL_JOBS_ACQUIRE_TOOLS],
  runtime: USEFUL_JOBS_RUNTIME,
  freeOffline: true,
  note: [
    "Free local package. Paid hosted extract on /for-agents stays a separate product and is not started by these jobs.",
    "No new public paid HTTP merchant route is claimed.",
    "Acquire tools are host utilities for download/verify/extract only; offline runs need Node >= 22 after extract.",
    USEFUL_JOBS_RELEASE_NOTE,
    "Version 1.4.0 remains at /for-agents/useful-jobs/useful-jobs-1.4.0.tar.gz.",
    "Version 1.3.0 remains at /for-agents/useful-jobs/useful-jobs-1.3.0.tar.gz.",
    "Version 1.2.0 remains at /for-agents/useful-jobs/useful-jobs-1.2.0.tar.gz.",
    "Version 1.1.0 remains at /for-agents/useful-jobs/useful-jobs-1.1.0.tar.gz.",
    "Version 1.0.0 remains at /for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz.",
  ].join(" "),
};

writeFileSync(out, `${JSON.stringify(discovery, null, 2)}\n`);
process.stdout.write(`${out}\n`);
