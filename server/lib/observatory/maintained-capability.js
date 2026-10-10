/**
 * Maintained SameDayDesk execution this projection can name.
 * Package, version, and job ids come from the declared discovery record.
 * releaseScope is checked as the same set, not a second list that can drift.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const USEFUL_JOBS_DISCOVERY = fileURLToPath(new URL("../../../client/public/discovery/useful-jobs.json", import.meta.url));

export function maintainedCapabilityFromDocument(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error("useful_jobs_discovery_invalid");
  }
  const reviewed = doc.releaseScope?.newlyReviewedJobIds;
  const inherited = doc.releaseScope?.inheritedJobIds;
  const jobs = doc.jobs;
  if (doc.schema !== "samedaydesk.for-agents.useful-jobs.v1" || doc.package !== "useful-jobs") {
    throw new Error("useful_jobs_discovery_invalid");
  }
  if (typeof doc.version !== "string" || doc.version !== doc.releaseScope?.approvedVersion) {
    throw new Error("useful_jobs_discovery_invalid");
  }
  if (!Array.isArray(jobs) || !Array.isArray(reviewed) || !Array.isArray(inherited)) {
    throw new Error("useful_jobs_discovery_invalid");
  }
  if (jobs.some((id) => typeof id !== "string" || id.length < 1) || new Set(jobs).size !== jobs.length) {
    throw new Error("useful_jobs_discovery_invalid");
  }
  const partition = [...reviewed, ...inherited];
  const sameSet = partition.length === jobs.length
    && new Set(partition).size === jobs.length
    && jobs.every((id) => partition.includes(id));
  if (!sameSet) throw new Error("useful_jobs_discovery_invalid");
  if (doc.offline !== true || doc.freeOffline !== true || doc.purchaseAuthority !== false) {
    throw new Error("useful_jobs_discovery_invalid");
  }
  if (doc.releaseScope.hostedAcquisition !== false) throw new Error("useful_jobs_discovery_invalid");
  return Object.freeze({
    schema: doc.schema,
    package: doc.package,
    version: doc.version,
    execution: "offline_caller_supplied_artifacts",
    purchaseAuthority: false,
    hostedAcquisition: false,
    jobIds: Object.freeze(jobs.slice()),
    discovery: "client/public/discovery/useful-jobs.json",
  });
}

export const MAINTAINED_CAPABILITY = maintainedCapabilityFromDocument(JSON.parse(readFileSync(USEFUL_JOBS_DISCOVERY, "utf8")));
export const MAINTAINED_JOB_IDS = new Set(MAINTAINED_CAPABILITY.jobIds);
