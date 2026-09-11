import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { getJob, requiredKeys, optionalKeys } from "../../../../server/paid-useful-jobs/lib/jobs.mjs";
import { inspectSample } from "../../../../server/paid-useful-jobs/lib/sample-guard.mjs";
import { ensureUsefulJobsKit } from "../../../../server/paid-useful-jobs/lib/engine.mjs";
import { SCHEMA_ID } from "./pins.mjs";
import { refuse } from "./errors.mjs";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertInsideRoot(root, target, label) {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);
  const rel = relative(resolvedRoot, resolvedTarget);
  if (rel.startsWith("..") || rel.startsWith("..\\")) {
    throw refuse("path-escape", `Path ${label} escapes corpus root`, { root, path: target });
  }
  return resolvedTarget;
}

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (err) {
    throw refuse("input-malformed", `Not valid JSON: ${filePath}`, { path: filePath, error: err.message });
  }
}

function resolveCorpusPath(input) {
  const abs = resolve(input);
  if (!existsSync(abs)) {
    throw refuse("missing-corpus", `Corpus path not found: ${abs}`, { path: abs });
  }
  const st = statSync(abs);
  if (st.isDirectory()) {
    const manifest = join(abs, "corpus.json");
    const caseFile = join(abs, "case.json");
    if (existsSync(manifest)) return { kind: "corpus", root: abs, manifest };
    if (existsSync(caseFile)) return { kind: "case", root: abs, manifest: caseFile };
    throw refuse("missing-corpus", "Directory needs corpus.json or case.json", { path: abs });
  }
  return { kind: existsSync(join(dirname(abs), "corpus.json")) || abs.endsWith("corpus.json") ? "corpus" : "case", root: dirname(abs), manifest: abs };
}

function resolveInputs(job, spec, caseRoot, corpusRoot) {
  const req = requiredKeys(job);
  const opt = optionalKeys(job);
  const allowed = new Set([...req, ...opt]);
  const raw = spec.inputs && typeof spec.inputs === "object" ? spec.inputs : {};
  const files = {};
  for (const key of allowed) {
    const value = raw[key];
    if (value == null || value === "") continue;
    if (typeof value !== "string") {
      throw refuse("input-malformed", `Input ${key} must be a relative file path`, { key });
    }
    const abs = assertInsideRoot(corpusRoot, join(caseRoot, value), key);
    if (!existsSync(abs)) {
      throw refuse("missing-required-inputs", `Input ${key} not found: ${abs}`, { key, path: abs });
    }
    const st = statSync(abs);
    if (key === "input-root") {
      if (!st.isDirectory()) {
        throw refuse("input-root-not-directory", "input-root must be a directory", { path: abs });
      }
    } else if (!st.isFile()) {
      throw refuse("input-not-file", `Input ${key} must be a file`, { key, path: abs });
    }
    files[key] = abs;
  }
  const missing = req.filter((k) => !files[k]);
  if (missing.length) {
    throw refuse("missing-required-inputs", `Caller corpus requires ${job.requiredInputs.join(", ")}`, {
      missing,
      required: req,
    });
  }
  return files;
}

function classifyCaller(jobId, files, kitRoot) {
  const sample = inspectSample({ jobId, inputs: files }, { kitRoot });
  return {
    sample: sample.sample,
    sampleReasons: sample.reasons,
    independentlyValidCaller: sample.sample === false,
  };
}

function loadCaseRecord(spec, { corpusRoot, caseRoot, kitRoot }) {
  const id = spec.id;
  const jobId = spec.jobId;
  if (!id || !jobId) {
    throw refuse("invalid-schema", "Each case needs id and jobId", { spec });
  }
  if (spec.example === true || spec.example === "true") {
    throw refuse("sample-not-caller-corpus", "Caller corpus cases cannot set example/--example", { id, jobId });
  }
  let job;
  try {
    job = getJob(jobId);
  } catch (err) {
    throw refuse("unknown-job", err.message, { jobId });
  }
  const files = resolveInputs(job, spec, caseRoot, corpusRoot);
  const sample = classifyCaller(jobId, files, kitRoot);
  if (sample.sample) {
    throw refuse(
      "sample-not-caller-corpus",
      "Kit SAMPLE / --example / SAMPLE-labelled files are not independently valid caller examples",
      { id, jobId, sampleReasons: sample.sampleReasons },
    );
  }
  return {
    id,
    jobId,
    title: job.title,
    files,
    requiredInputs: [...job.requiredInputs],
    outputs: [...job.outputs],
    sample: false,
    sampleReasons: [],
    independentlyValidCaller: true,
  };
}

/**
 * Load a caller-supplied corpus. SAMPLE/--example members are refused, not executed as sales.
 */
export function loadCorpus(input, { kitRoot = ensureUsefulJobsKit() } = {}) {
  const located = resolveCorpusPath(input);
  const body = readJson(located.manifest);

  if (located.kind === "case" && (!body.schema || body.schema === "samedaydesk.caller-example-case.v1")) {
    const loaded = loadCaseRecord(body, { corpusRoot: located.root, caseRoot: located.root, kitRoot });
    return {
      schema: SCHEMA_ID,
      id: loaded.id,
      root: located.root,
      enginePin: isPlainObject(body.enginePin) ? body.enginePin : null,
      cases: [loaded],
    };
  }

  if (body.schema !== SCHEMA_ID) {
    throw refuse("invalid-schema", `Expected schema ${SCHEMA_ID}`, { schema: body.schema || null });
  }
  const caseSpecs = Array.isArray(body.cases) ? body.cases : [];
  if (!caseSpecs.length) {
    throw refuse("invalid-schema", "Corpus needs at least one case", { path: located.manifest });
  }

  const cases = caseSpecs.map((spec) => {
    const relDir = spec.dir || spec.id;
    if (!relDir) {
      throw refuse("invalid-schema", "Each case needs dir or id", { spec });
    }
    const caseRoot = resolve(located.root, relDir);
    assertInsideRoot(located.root, caseRoot, spec.id || spec.dir);
    const caseFile = join(caseRoot, "case.json");
    const fromFile = existsSync(caseFile) ? readJson(caseFile) : {};
    const record = {
      id: spec.id || fromFile.id,
      jobId: spec.jobId || fromFile.jobId,
      inputs: spec.inputs || fromFile.inputs,
      example: spec.example ?? fromFile.example,
    };
    return loadCaseRecord(record, { corpusRoot: located.root, caseRoot, kitRoot });
  });

  return {
    schema: SCHEMA_ID,
    id: body.id || "caller-corpus",
    root: located.root,
    enginePin: isPlainObject(body.enginePin) ? body.enginePin : null,
    cases,
  };
}

export function sampleProbe(files, { kitRoot = ensureUsefulJobsKit() } = {}) {
  return inspectSample({ inputs: files }, { kitRoot });
}
