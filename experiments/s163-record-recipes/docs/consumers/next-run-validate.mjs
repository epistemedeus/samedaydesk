#!/usr/bin/env node
/**
 * Compact next-run/*.manifest.json validator (s163.next-run-manifest.v1).
 * Reuses pins as written; does not invent used-ops, keys, or source metadata.
 * If mapped manifests are missing, runs the owning demos to create them.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA = 's163.next-run-manifest.v1';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const NEXT_RUN = path.join(ROOT, 'next-run');

/** parser → retain names copied from adapters (prep or buildNextRunManifest). */
const RETAIN_BY_PARSER = {
  's134-openapi-impact': ['units', 'coverage', 'sourceUrl', 'commit', 'license'],
  's134-csv-drift': ['keyColumns', 'sourceUrl', 'commit', 'license', 'coverage'],
  's134-pricing-table-change': ['units', 'sourceUrl', 'license'],
  's134-rss-atom-brief': ['sourceUrl', 'license', 'format', 'synthetic'],
};

/** Files demos actually emit — only these are created when missing. */
const DEMO_MANIFESTS = [
  { file: 'R-OPENAPI-PIN-IMPACT.manifest.json', demo: 'demos/openapi-used-ops.mjs' },
  { file: 'R-CSV-KEYED-CHANGE.manifest.json', demo: 'demos/csv-keyed-drift.mjs' },
];

function listManifests() {
  if (!fs.existsSync(NEXT_RUN)) return [];
  return fs
    .readdirSync(NEXT_RUN)
    .filter((n) => n.endsWith('.manifest.json'))
    .sort()
    .map((n) => path.join(NEXT_RUN, n));
}

function runDemo(rel) {
  const r = spawnSync(process.execPath, [path.join(ROOT, rel)], {
    encoding: 'utf8',
    cwd: ROOT,
    maxBuffer: 20 * 1024 * 1024,
  });
  return { demo: rel, status: r.status, stderr: (r.stderr || '').trim(), stdout: (r.stdout || '').trim() };
}

function ensureManifests() {
  const created = [];
  const demoErrors = [];
  fs.mkdirSync(NEXT_RUN, { recursive: true });
  for (const { file, demo } of DEMO_MANIFESTS) {
    const dest = path.join(NEXT_RUN, file);
    if (fs.existsSync(dest)) continue;
    const ran = runDemo(demo);
    const wrote = fs.existsSync(dest);
    created.push({ file, demo, ok: ran.status === 0 && wrote });
    if (ran.status !== 0 || !wrote) {
      demoErrors.push({ file, demo, status: ran.status, stderr: ran.stderr.slice(0, 800) });
    }
  }
  return { created, demoErrors };
}

function resolveInput(p) {
  if (typeof p !== 'string' || !p) return p;
  return path.isAbsolute(p) ? p : path.join(ROOT, p);
}

function recipeExists(recipeId) {
  const recipesDir = path.join(ROOT, 'recipes');
  if (!fs.existsSync(recipesDir)) return false;
  const walk = (d) => {
    for (const n of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, n.name);
      if (n.isDirectory()) {
        if (walk(p)) return true;
      } else if (n.name === `${recipeId}.json`) {
        return true;
      }
    }
    return false;
  };
  return walk(recipesDir);
}

function retainFor(man) {
  if (Array.isArray(man.retain) && man.retain.every((x) => typeof x === 'string')) {
    return { retain: man.retain, retainSource: 'manifest' };
  }
  const hinted = RETAIN_BY_PARSER[man.parser];
  if (hinted) return { retain: hinted, retainSource: 'adapter-prep' };
  return { retain: [], retainSource: 'none' };
}

function validateManifest(filePath) {
  const file = path.basename(filePath);
  const issues = [];
  let man;
  try {
    man = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return { file, ok: false, schema: null, recipeId: null, retain: [], issues: [`json: ${e.message}`] };
  }
  if (man.schema !== SCHEMA) issues.push(`schema: expected ${SCHEMA}, got ${JSON.stringify(man.schema)}`);
  if (typeof man.recipeId !== 'string' || !man.recipeId) issues.push('recipeId: missing');
  else if (!recipeExists(man.recipeId)) issues.push(`recipeId: no recipes/**/${man.recipeId}.json`);
  if (typeof man.parser !== 'string' || !man.parser) issues.push('parser: missing');
  if (!man.inputs || typeof man.inputs !== 'object' || Array.isArray(man.inputs)) issues.push('inputs: missing object');
  if (man.paidValueClaim !== false) issues.push('paidValueClaim: must be false (do not invent paid value)');
  if (man.retain != null && !Array.isArray(man.retain)) issues.push('retain: must be string[] when present');

  const inputs = man.inputs && typeof man.inputs === 'object' ? man.inputs : {};
  for (const key of ['before', 'after', 'used']) {
    if (typeof inputs[key] !== 'string') continue;
    const resolved = resolveInput(inputs[key]);
    if (!fs.existsSync(resolved)) issues.push(`inputs.${key}: missing file ${inputs[key]}`);
  }
  if (man.parser === 's134-openapi-impact' && typeof inputs.used !== 'string') {
    issues.push('inputs.used: used-ops pin path required (do not invent operations)');
  }
  if (man.parser === 's134-csv-drift') {
    if (!Array.isArray(inputs.keyColumns) || inputs.keyColumns.length === 0) {
      issues.push('inputs.keyColumns: required (do not invent keys)');
    }
  }

  const { retain, retainSource } = retainFor(man);
  return {
    file,
    ok: issues.length === 0,
    schema: man.schema ?? null,
    recipeId: man.recipeId ?? null,
    parser: man.parser ?? null,
    retain,
    retainSource,
    paidValueClaim: man.paidValueClaim ?? null,
    issues,
  };
}

export function validateNextRun() {
  const ensured = ensureManifests();
  const files = listManifests();
  const manifests = files.map(validateManifest);
  const ok = ensured.demoErrors.length === 0 && manifests.length > 0 && manifests.every((m) => m.ok);
  return {
    ok,
    schema: SCHEMA,
    createdFromDemos: ensured.created,
    demoErrors: ensured.demoErrors,
    count: manifests.length,
    manifests,
  };
}

const isMain =
  Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const summary = validateNextRun();
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.ok ? 0 : 1);
}
