import { createHash } from "node:crypto";

import {
  canonicalJson,
  normalizeRequestContract,
  publicRequestBinding,
} from "../buyer/request-contract.mjs";

export const JOB_CONTRACT_SCHEMA = "job-contract.v1";

function fail(message) {
  throw new Error(message);
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function nonEmptyString(value, label) {
  const text = String(value || "").trim();
  if (!text) fail(`${label} is required`);
  return text;
}

export function normalizeTarget(value) {
  let target;
  try {
    target = new URL(value);
  } catch {
    fail("job contract target must be a valid URL");
  }
  if (target.protocol !== "https:" || target.username || target.password || target.hash) {
    fail("job contract target must be credential-free HTTPS without a fragment");
  }
  return target.toString();
}

export function normalizeSourceRef(value) {
  const source = record(value);
  if (!source) fail("exact source ref is required");
  const sha = nonEmptyString(source.sha, "source sha");
  if (!/^[0-9a-f]{40}$/i.test(sha)) fail("source sha must be a 40-character commit SHA");
  const repo = nonEmptyString(source.repo, "source repo");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) fail("source repo must be owner/name");
  return {
    repo,
    sha: sha.toLowerCase(),
    ...(source.ref ? { ref: nonEmptyString(source.ref, "source ref") } : {}),
    ...(source.path ? { path: nonEmptyString(source.path, "source path") } : {}),
  };
}

export function normalizeTask(value) {
  const task = record(value);
  if (!task) fail("task identity and terms are required");
  return {
    id: nonEmptyString(task.id, "task id"),
    terms: nonEmptyString(task.terms, "task terms"),
    ...(task.consumer ? { consumer: nonEmptyString(task.consumer, "task consumer") } : {}),
  };
}

export function normalizeImmaterialPaths(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) fail("immaterial input paths must be an array");
  const paths = [...new Set(value.map((item) => String(item).trim()).filter(Boolean))].sort();
  if (paths.some((path) => !/^[A-Za-z0-9_.-]+(?:\.[A-Za-z0-9_.-]+)*$/.test(path))) {
    fail("immaterial input path is invalid");
  }
  return paths;
}

export function omitPaths(value, paths, depth = 0) {
  if (!paths.length) return value;
  if (value === null || typeof value !== "object") return value;
  if (depth > 20) fail("value exceeds maximum depth");
  if (Array.isArray(value)) return value.map((item) => omitPaths(item, paths, depth + 1));
  const exact = new Set(paths);
  const result = {};
  for (const key of Object.keys(value).sort()) {
    if (exact.has(key)) continue;
    const childPaths = paths
      .filter((path) => path.startsWith(`${key}.`))
      .map((path) => path.slice(key.length + 1));
    result[key] = childPaths.length ? omitPaths(value[key], childPaths, depth + 1) : value[key];
  }
  return result;
}

export function computeRequestDigest({ request, target }) {
  const binding = publicRequestBinding(request);
  const normalizedTarget = normalizeTarget(target);
  return `sha256:${createHash("sha256")
    .update(canonicalJson({ binding, target: normalizedTarget }))
    .digest("hex")}`;
}

export function normalizeQuote(value, requestDigest) {
  const quote = record(value);
  if (!quote) fail("bound quote is required");
  const boundRequestDigest = nonEmptyString(quote.boundRequestDigest, "quote boundRequestDigest");
  if (boundRequestDigest !== requestDigest) fail("quote is not bound to the exact request digest");
  const amountAtomic = String(quote.amountAtomic || "").trim();
  if (!/^[0-9]+$/.test(amountAtomic)) fail("quote amountAtomic must be a non-negative integer string");
  const asset = nonEmptyString(quote.asset, "quote asset");
  const network = nonEmptyString(quote.network, "quote network");
  return {
    amountAtomic,
    asset,
    network,
    boundRequestDigest,
    unsigned: quote.unsigned === true,
    ...(quote.note ? { note: nonEmptyString(quote.note, "quote note") } : {}),
  };
}

export function normalizeRequiredEvidence(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 16) {
    fail("acceptance requires 1 to 16 required evidence records");
  }
  return value.map((item, index) => {
    const evidence = record(item);
    if (!evidence) fail(`required evidence ${index} must be an object`);
    const name = nonEmptyString(evidence.name, `required evidence ${index} name`);
    if (evidence.digest) {
      const digest = nonEmptyString(evidence.digest, `required evidence ${index} digest`);
      if (!/^sha256:[0-9a-f]{64}$/.test(digest)) fail(`required evidence ${index} digest is invalid`);
      return { name, digest };
    }
    if (evidence.value === undefined) fail(`required evidence ${index} needs a digest or value`);
    return { name, digest: `sha256:${createHash("sha256").update(canonicalJson(evidence.value)).digest("hex")}` };
  }).sort((left, right) => left.name.localeCompare(right.name));
}

export function normalizeAcceptanceCriteria(value) {
  const acceptance = record(value);
  if (!acceptance) fail("acceptance criteria are required");
  if (acceptance.expectedResult === undefined) fail("expected result is required");
  return {
    expectedResult: JSON.parse(canonicalJson(acceptance.expectedResult)),
    requiredEvidence: normalizeRequiredEvidence(acceptance.requiredEvidence),
    immaterialInputPaths: normalizeImmaterialPaths(acceptance.immaterialInputPaths),
  };
}

export function evidenceDigest(value) {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

export function buildJobContract(input) {
  const value = record(input);
  if (!value) fail("job contract input is required");
  const request = normalizeRequestContract(value.request);
  const target = normalizeTarget(value.target);
  const requestDigest = computeRequestDigest({ request, target });
  const quote = normalizeQuote(value.quote, requestDigest);
  const acceptance = normalizeAcceptanceCriteria(value.acceptance);
  return {
    schemaVersion: JOB_CONTRACT_SCHEMA,
    synthetic: value.synthetic === true,
    task: normalizeTask(value.task),
    source: normalizeSourceRef(value.source),
    target,
    request,
    requestBinding: publicRequestBinding(request),
    requestDigest,
    quote,
    outcome: {
      expectedResult: acceptance.expectedResult,
      requiredEvidence: acceptance.requiredEvidence,
    },
    acceptance,
  };
}
