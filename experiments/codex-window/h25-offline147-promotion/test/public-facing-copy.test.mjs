import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  USEFUL_JOBS_DESCRIPTION,
  USEFUL_JOBS_PUBLIC_SUMMARY,
  USEFUL_JOBS_RELEASE_NOTE,
  USEFUL_JOBS_SHELL,
} from "../../../../client/src/data/machineEntry.mjs";
import KIT from "../../../../client/src/data/usefulJobsKit.json" with { type: "json" };
import { INHERITED, NEWLY_REVIEWED } from "../lib/pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");

const PUBLIC_COPY_PATHS = [
  "client/src/pages/UsefulJobs.tsx",
  "client/src/pages/ForAgents.tsx",
  "client/public/llms.txt",
  "client/public/discovery/useful-jobs.json",
];

test("customer-facing copy has the public summary and no internal H21 labels", () => {
  assert.equal(USEFUL_JOBS_DESCRIPTION, USEFUL_JOBS_PUBLIC_SUMMARY);
  assert.match(USEFUL_JOBS_PUBLIC_SUMMARY, /Ten offline jobs for lockfile changes/);
  assert.doesNotMatch(USEFUL_JOBS_PUBLIC_SUMMARY, /H21/);
  assert.doesNotMatch(USEFUL_JOBS_PUBLIC_SUMMARY, /inherited/);
  assert.equal(
    USEFUL_JOBS_RELEASE_NOTE,
    "Release 1.4.7 adds fresh verification for lockfile-pin-delta, json-schema-webhook-drift, route-table-diff, page-change-offline-job, and vendor-budget-impact. The other five jobs are carried forward without a new review.",
  );
  assert.doesNotMatch(USEFUL_JOBS_RELEASE_NOTE, /H21/);

  const crawler = USEFUL_JOBS_SHELL.crawlerHtml;
  assert.match(crawler, /Ten offline jobs for lockfile changes/);
  assert.match(crawler, /Release 1\.4\.7 adds fresh verification/);
  assert.doesNotMatch(crawler, /H21/);
  assert.doesNotMatch(USEFUL_JOBS_SHELL.description, /H21/);

  const discovery = JSON.parse(
    readFileSync(join(root, "client/public/discovery/useful-jobs.json"), "utf8"),
  );
  assert.equal(discovery.summary, USEFUL_JOBS_PUBLIC_SUMMARY);
  assert.equal(discovery.note.includes(USEFUL_JOBS_RELEASE_NOTE), true);
  assert.doesNotMatch(discovery.summary, /H21/);
  assert.doesNotMatch(discovery.note, /H21/);
  assert.doesNotMatch(JSON.stringify(discovery.releaseScope), /H21/);
  assert.deepEqual(discovery.releaseScope.newlyReviewedJobIds, [...NEWLY_REVIEWED]);
  assert.deepEqual(discovery.releaseScope.inheritedJobIds, [...INHERITED]);
  assert.deepEqual([...KIT.newlyReviewedJobIds], [...NEWLY_REVIEWED]);
  assert.deepEqual([...KIT.inheritedJobIds], [...INHERITED]);
  assert.equal(KIT.purchaseAuthority, false);
  assert.equal(KIT.paidHostedClaim, false);
  assert.equal(discovery.purchaseAuthority, false);
  assert.equal(discovery.paidHostedClaim, false);

  for (const rel of PUBLIC_COPY_PATHS) {
    const text = readFileSync(join(root, rel), "utf8");
    assert.doesNotMatch(text, /H21/, rel);
  }

  const forAgents = readFileSync(join(root, "client/src/pages/ForAgents.tsx"), "utf8");
  assert.match(forAgents, /Archive 1\.4\.7 contains all ten useful offline jobs/);
  assert.doesNotMatch(forAgents, /inherited/);

  const usefulJobs = readFileSync(join(root, "client/src/pages/UsefulJobs.tsx"), "utf8");
  assert.match(usefulJobs, /Ten offline jobs for lockfile changes/);
  assert.match(usefulJobs, /Release 1\.4\.7 adds fresh verification/);
  assert.doesNotMatch(usefulJobs, /H21 newly reviewed/);

  const llms = readFileSync(join(root, "client/public/llms.txt"), "utf8");
  assert.match(llms, /ten local jobs for lockfile changes/);
  assert.doesNotMatch(llms, /H21/);
});
