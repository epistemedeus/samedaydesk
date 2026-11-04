/**
 * Maintained SameDayDesk execution this projection can name.
 * Package, version, and job ids come from the declared discovery record.
 * releaseScope is checked as the same set, not a second list that can drift.
 * lookupCapabilityOwner answers one exact job id from that record, or no-fit.
 * Exact ids are this prototype's scope, not a semantic router.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

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

function noFit(reason, jobId = null) {
  return Object.freeze({
    outcome: "no-fit",
    reason,
    jobId,
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

const PUBLIC_ROOT = fileURLToPath(new URL("../../../client/public/", import.meta.url));
const FLAG = /^--[a-z0-9-]+$/;
let kitCache = null;

function kitRoot(doc) {
  if (typeof doc.coldStart !== "string") return null;
  const match = doc.coldStart.match(/root="\$work\/([A-Za-z0-9._-]+)"/);
  return match ? match[1] : null;
}

function archivePin(doc) {
  const archive = doc.archive;
  if (!archive || typeof archive !== "object" || Array.isArray(archive)) return null;
  if (typeof archive.path !== "string" || !archive.path.startsWith("/") || archive.path.includes("..")) return null;
  if (typeof archive.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(archive.sha256)) return null;
  if (!Number.isSafeInteger(archive.bytes) || archive.bytes < 1) return null;
  return archive;
}

function headerName(header) {
  const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/s, "");
  const prefix = header.subarray(345, 500).toString("utf8").replace(/\0.*$/s, "");
  if (!prefix) return name;
  return `${prefix}/${name}`;
}

function readTarTexts(tar, root) {
  const texts = new Map();
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    let blank = true;
    for (let i = 0; i < 512; i += 1) {
      if (header[i] !== 0) {
        blank = false;
        break;
      }
    }
    if (blank) break;
    const sizeText = header.subarray(124, 136).toString("utf8").replace(/\0.*$/s, "").trim();
    const size = Number.parseInt(sizeText || "0", 8);
    const typeflag = header[156];
    const name = headerName(header);
    offset += 512;
    if (!Number.isSafeInteger(size) || size < 0 || offset + size > tar.length) return null;
    const body = tar.subarray(offset, offset + size);
    offset += Math.ceil(size / 512) * 512;
    const regular = typeflag === 0 || typeflag === 48;
    if (!regular || size > 1_000_000 || !name.startsWith(`${root}/`)) continue;
    const relative = name.slice(root.length + 1);
    if (relative !== "catalog.json" && !relative.endsWith(".mjs")) continue;
    if (relative !== "catalog.json" && !relative.startsWith("apps/") && !relative.startsWith("engines/")) continue;
    texts.set(relative, body.toString("utf8"));
  }
  return texts;
}

function quotedKeys(body) {
  return [...body.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function flagsFromCallerSource(text) {
  const lists = [];
  for (const match of text.matchAll(/requireCallerInputs\(\s*[^,\n]+,\s*\[([^\]]*)\]/g)) {
    const keys = quotedKeys(match[1]).map((key) => `--${key}`);
    if (keys.length && keys.every((flag) => FLAG.test(flag))) lists.push(keys);
  }
  for (const match of text.matchAll(/const missing = \[([^\]]*)\]\.filter/g)) {
    const keys = quotedKeys(match[1]).map((key) => `--${key}`);
    if (keys.length && keys.every((flag) => FLAG.test(flag))) lists.push(keys);
  }
  return lists;
}

function flagsFromUsage(text) {
  const lists = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line.includes("--")) continue;
    if (/(?:^|\s)--(?:example|help|sample)(?:\s|$)/.test(line)) continue;
    const stripped = line.replace(/\[[^\]]*\]/g, " ");
    const flags = [...stripped.matchAll(/(?:^|\s)(--[a-z0-9-]+)(?=\s|<|$)/g)].map((match) => match[1]);
    if (flags.length && flags.every((flag) => FLAG.test(flag))) lists.push(flags);
  }
  return lists;
}

function sameFlagSet(left, right) {
  return left.length === right.length && left.every((flag) => right.includes(flag));
}

function jobSources(texts, jobId) {
  const appPrefix = `apps/${jobId}/`;
  const enginePrefix = `engines/${jobId}/`;
  let combined = "";
  for (const [relative, text] of texts) {
    if (relative.startsWith(appPrefix) || relative.startsWith(enginePrefix)) combined += `\n${text}`;
  }
  return combined;
}

function flagsForJob(texts, jobId) {
  const catalog = texts.get("catalog.json");
  if (!catalog) return { error: "required_flags_underivable" };
  let parsed;
  try {
    parsed = JSON.parse(catalog);
  } catch {
    return { error: "required_flags_underivable" };
  }
  const job = Array.isArray(parsed.jobs) ? parsed.jobs.find((item) => item && item.id === jobId) : null;
  const declared = job && Array.isArray(job.requiredInputs) ? job.requiredInputs : null;
  if (!declared || declared.some((flag) => typeof flag !== "string" || !FLAG.test(flag))) {
    return { error: "required_flags_underivable" };
  }
  const source = jobSources(texts, jobId);
  const found = [...flagsFromCallerSource(source), ...flagsFromUsage(source)];
  if (!found.some((list) => sameFlagSet(list, declared))) return { error: "required_flags_disagree" };
  return { flags: declared.slice() };
}

function loadKit(doc) {
  const pin = archivePin(doc);
  const root = kitRoot(doc);
  if (!pin || !root) return { error: "call_recipe_unavailable" };
  const key = `${pin.sha256}:${pin.bytes}:${root}:${pin.path}`;
  if (kitCache && kitCache.key === key) return kitCache.value;
  let value;
  try {
    const file = join(PUBLIC_ROOT, pin.path.slice(1));
    const bytes = readFileSync(file);
    if (bytes.length !== pin.bytes || createHash("sha256").update(bytes).digest("hex") !== pin.sha256) {
      value = { error: "call_recipe_unavailable" };
    } else {
      const texts = readTarTexts(gunzipSync(bytes), root);
      value = texts ? { texts } : { error: "call_recipe_unavailable" };
    }
  } catch {
    value = { error: "call_recipe_unavailable" };
  }
  kitCache = { key, value };
  return value;
}

function recipeFor(doc, jobId) {
  if (typeof doc.coldStart !== "string" || typeof doc.package !== "string") return { error: "call_recipe_unavailable" };
  const binary = `bin/${doc.package}.mjs`;
  if (!doc.coldStart.includes(`node ${binary} list`)) return { error: "call_recipe_unavailable" };
  const kit = loadKit(doc);
  if (kit.error) return kit;
  const derived = flagsForJob(kit.texts, jobId);
  if (derived.error) return derived;
  const argv = ["node", binary, "run", jobId];
  for (const flag of derived.flags) argv.push(flag, `<${flag.slice(2)}>`);
  return {
    recipe: Object.freeze({
      acquire: doc.coldStart,
      cwdFromAcquireStdout: true,
      requiredInputs: Object.freeze(derived.flags.slice()),
      argv: Object.freeze(argv),
    }),
  };
}

export function bindCapabilityCall(recipe, values) {
  if (!recipe || !Array.isArray(recipe.argv) || !Array.isArray(recipe.requiredInputs)) return null;
  if (!values || typeof values !== "object" || Array.isArray(values)) return null;
  const argv = [];
  const seen = new Set();
  for (let index = 0; index < recipe.argv.length; index += 1) {
    const token = recipe.argv[index];
    if (!recipe.requiredInputs.includes(token)) {
      argv.push(token);
      continue;
    }
    const slot = recipe.argv[index + 1];
    const value = values[token];
    if (slot !== `<${token.slice(2)}>` || typeof value !== "string" || value.length === 0) return null;
    argv.push(token, value);
    seen.add(token);
    index += 1;
  }
  if (seen.size !== recipe.requiredInputs.length) return null;
  return argv;
}

function repoOf(doc) {
  const repo = doc.pins && typeof doc.pins.sourceRepo === "string" ? doc.pins.sourceRepo : "";
  return repo.length > 0 ? repo : null;
}

/**
 * Read-only owner lookup for one exact job id.
 * Exact ids are this prototype's scope, not a semantic router.
 * An id the current document does not list is unknown_need, whether it was
 * removed or never present. This module keeps no removal history and no ledger.
 * Inherited jobs stay callable with the review stamp that document declares.
 * A version that disagrees with releaseScope.approvedVersion is refused
 * before any owner is named.
 * The call recipe's required flags are derived from the kit archive that
 * document names, and confirmed against that kit's CLI. argv is an argument
 * list, with a value slot after each required flag. This does not fetch,
 * store, mount a route, or copy the job list.
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
  const built = recipeFor(doc, jobId);
  if (!built.recipe) {
    const named = built.error === "required_flags_underivable" || built.error === "required_flags_disagree";
    return noFit(built.error, named ? jobId : null);
  }
  const callRecipe = built.recipe;
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
