/**
 * Maintained SameDayDesk execution this projection can name.
 * Package, version, and job ids come from the declared discovery record.
 * releaseScope is checked as the same set, not a second list that can drift.
 * lookupCapabilityOwner answers one task need from that record, or no-fit.
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

const discoveryDocument = JSON.parse(readFileSync(USEFUL_JOBS_DISCOVERY, "utf8"));

export const MAINTAINED_CAPABILITY = maintainedCapabilityFromDocument(discoveryDocument);
export const MAINTAINED_JOB_IDS = new Set(MAINTAINED_CAPABILITY.jobIds);

export const CAPABILITY_OWNER_LOOKUP_CANNOT_ESTABLISH = Object.freeze([
  "distinct later accepted tasks calling the owned capability instead of rebuilding",
  "rebuild effort saved net of call, adaptation, and upkeep",
  "that an unmatched need has no owner outside this discovery document",
  "that an inherited job and a newly reviewed job differ as executables",
]);

function noFit(reason) {
  return Object.freeze({
    outcome: "no-fit",
    reason,
    jobId: null,
    owner: null,
    version: null,
    review: null,
    execution: null,
    purchaseAuthority: null,
    hostedAcquisition: null,
    discovery: null,
    callRecipe: null,
    cannotEstablish: CAPABILITY_OWNER_LOOKUP_CANNOT_ESTABLISH,
  });
}

function readNeed(need) {
  if (typeof need === "string") return need.length > 0 ? need : null;
  if (!need || typeof need !== "object" || Array.isArray(need)) return null;
  const named = ["jobId", "skill", "need"].flatMap((key) => (
    typeof need[key] === "string" ? [need[key]] : []
  ));
  if (named.length === 0) return null;
  if (named.some((value) => value !== named[0] || value.length === 0)) return null;
  return named[0];
}

function refusalReason(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return "malformed_discovery";
  const scope = doc.releaseScope;
  const approved = scope && typeof scope === "object" ? scope.approvedVersion : undefined;
  if (typeof doc.version === "string" && typeof approved === "string" && doc.version !== approved) {
    try {
      maintainedCapabilityFromDocument({ ...doc, version: approved });
      return "version_not_approved";
    } catch (error) {
      if (!error || error.message !== "useful_jobs_discovery_invalid") throw error;
    }
  }
  return "malformed_discovery";
}

function reviewOf(doc, jobId) {
  const reviewed = doc.releaseScope.newlyReviewedJobIds.includes(jobId);
  const inherited = doc.releaseScope.inheritedJobIds.includes(jobId);
  if (reviewed && !inherited) return "newly_reviewed";
  if (inherited && !reviewed) return "inherited";
  return null;
}

function recipeFor(doc, jobId) {
  if (typeof doc.coldStart !== "string" || typeof doc.package !== "string") return null;
  const binary = `bin/${doc.package}.mjs`;
  if (!doc.coldStart.includes(`node ${binary} list`)) return null;
  return Object.freeze({
    acquire: doc.coldStart,
    cwdFromAcquireStdout: true,
    argv: Object.freeze(["node", binary, "run", jobId]),
  });
}

function repoOf(doc) {
  const repo = doc.pins && typeof doc.pins.sourceRepo === "string" ? doc.pins.sourceRepo : "";
  return repo.length > 0 ? repo : null;
}

/**
 * Read-only owner lookup for one task need.
 * A fit names the maintained job (these ids are the maintained skills),
 * its owner, the approved version, and the call recipe already in the
 * discovery document. Anything else is no-fit. argv is an argument list,
 * not a shell command. This does not fetch, store, mount a route, or copy
 * the job list.
 */
export function lookupCapabilityOwner(need, document) {
  const doc = document === undefined ? discoveryDocument : document;
  let capability;
  try {
    capability = maintainedCapabilityFromDocument(doc);
  } catch (error) {
    if (!error || error.message !== "useful_jobs_discovery_invalid") throw error;
    return noFit(refusalReason(doc));
  }
  const jobId = readNeed(need);
  if (!jobId || !capability.jobIds.includes(jobId)) return noFit("unknown_need");
  const review = reviewOf(doc, jobId);
  if (!review) return noFit("malformed_discovery");
  const callRecipe = recipeFor(doc, jobId);
  if (!callRecipe) return noFit("call_recipe_unavailable");
  return Object.freeze({
    outcome: "owned",
    reason: null,
    jobId,
    owner: Object.freeze({
      package: capability.package,
      repo: repoOf(doc),
    }),
    version: capability.version,
    review,
    execution: capability.execution,
    purchaseAuthority: capability.purchaseAuthority,
    hostedAcquisition: capability.hostedAcquisition,
    discovery: capability.discovery,
    callRecipe,
    cannotEstablish: CAPABILITY_OWNER_LOOKUP_CANNOT_ESTABLISH,
  });
}
