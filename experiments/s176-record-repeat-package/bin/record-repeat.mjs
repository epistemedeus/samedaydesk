#!/usr/bin/env node
/**
 * S176 shared acquisition CLI — four source/record repeat-job families.
 * Reuses S134 parser modules (no second engine) + S163 adapters.
 * Free offline local processing. Optional existing paid extract is separate.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { MAX_CAPTURE_BYTES, PARSER_TIMEOUT_MS, NEXT_RUN_SCHEMAS } from './limits.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, '..');

function resolveRoots() {
  const candidates = [
    { s134: process.env.S176_S134_ROOT, s163: process.env.S176_S163_ROOT },
    {
      s134: path.join(PKG, 'vendor/s134-record-jobs'),
      s163: path.join(PKG, 'vendor/s163-record-recipes'),
    },
    {
      s134: path.join(PKG, '../s134-record-jobs'),
      s163: path.join(PKG, '../s163-record-recipes'),
    },
  ];
  for (const c of candidates) {
    if (!c.s134 || !c.s163) continue;
    if (
      fs.existsSync(path.join(c.s134, 'modules/openapi-impact/cli.mjs')) &&
      fs.existsSync(path.join(c.s163, 'adapters/openapi-used-ops.mjs'))
    ) {
      return c;
    }
  }
  throw new Error(
    'Cannot locate s134-record-jobs + s163-record-recipes. Set S176_S134_ROOT / S176_S163_ROOT or unpack the lean archive.',
  );
}

const { s134: S134, s163: S163 } = resolveRoots();
const { refuse } = await import(pathToFileURL(path.join(S163, 'adapters/refuse-unsupported.mjs')).href);

const FAMILIES = {
  'openapi-used-ops': {
    module: 'openapi-impact',
    adapter: 'openapi-used-ops.mjs',
    sampleRecipe: 'R-OPENAPI-PIN-IMPACT',
  },
  'pricing-row-unit': {
    module: 'pricing-table-change',
    adapter: 'pricing-row-unit.mjs',
    sampleRecipe: 'R-PRICE-UNIT-CASE',
  },
  'csv-keyed-drift': {
    module: 'csv-drift',
    adapter: 'csv-keyed.mjs',
    sampleRecipe: 'R-CSV-KEYED-CHANGE',
  },
  'rss-atom-brief': {
    module: 'rss-atom-brief',
    adapter: 'rss-atom.mjs',
    sampleRecipe: 'R-FEED-LIVE-NOCHANGE',
  },
};

const FAMILY_ALIASES = {
  'openapi-used-ops': 'openapi-used-ops',
  'pricing-row-unit': 'pricing-row-unit',
  'csv-keyed-drift': 'csv-keyed-drift',
  'rss-atom-brief': 'rss-atom-brief',
  's134-openapi-impact': 'openapi-used-ops',
  's134-pricing-table-change': 'pricing-row-unit',
  's134-csv-drift': 'csv-keyed-drift',
  's134-rss-atom-brief': 'rss-atom-brief',
};

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) out[key] = true;
      else {
        out[key] = next;
        i++;
      }
    } else out._.push(a);
  }
  return out;
}

function emit(obj, code = 0) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
  process.exit(code);
}

function help() {
  process.stdout.write(`record-repeat - SameDayDesk offline source comparison CLI

Commands:
  list
  sample --list | --all | --family <id> | --recipe <id>
  run --family <id> --before <f> --after <f> [--used <f>] [--key col[,col]] [--write-next-run <out>]
  run --recipe <id> [--write-next-run <out>]
  run --from-next-run <manifest> --before <f> --after <f> [--used <f>] [--key col] [--write-next-run <out>]

Families: ${Object.keys(FAMILIES).join(', ')}

Free offline processing of local artifacts. Optional existing paid merchant extract is separate.
Unsupported HTML / missing identity / missing units stay explicit; never synthesized.
Capture/manifest reads are capped at ${MAX_CAPTURE_BYTES} bytes. Parser child timeout ${PARSER_TIMEOUT_MS}ms.
`);
}

/** Explicit CLI path overrides resolve against CWD only (no unrelated-tree fallback). */
function resolveCliPath(p) {
  if (p == null || p === true) return null;
  if (path.isAbsolute(p)) return p;
  return path.resolve(process.cwd(), p);
}

/**
 * Manifest-sourced paths resolve against the declared manifest directory only.
 * Legacy s163.next-run-manifest.v1 paths may additionally resolve against the
 * S163 recipe root (not CWD) when the relative path is missing next to the manifest.
 */
function resolveManifestPath(p, manDir, { legacyS163 = false } = {}) {
  if (p == null || p === true) return null;
  if (path.isAbsolute(p)) return p;
  const fromMan = path.resolve(manDir, p);
  if (fs.existsSync(fromMan)) return fromMan;
  if (legacyS163) {
    const fromS163 = path.resolve(S163, p);
    if (fs.existsSync(fromS163)) return fromS163;
  }
  return fromMan;
}

/** Recipe-declared relative paths resolve against the S163 recipe tree, never CWD. */
function resolveRecipePath(p) {
  if (p == null || p === true) return null;
  if (path.isAbsolute(p)) return p;
  return path.resolve(S163, p);
}

function isExistingFile(p) {
  try {
    return Boolean(p) && fs.existsSync(p) && fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function inspectCapture(p, label, { missingCode = 'missing-capture' } = {}) {
  if (p == null || p === '') {
    return refuse(missingCode, `${label} capture missing`, { path: p, label });
  }
  let st;
  try {
    st = fs.lstatSync(p);
  } catch {
    return refuse(missingCode, `${label} capture missing`, { path: p, label });
  }
  if (st.isSymbolicLink()) {
    try {
      st = fs.statSync(p);
    } catch {
      return refuse('missing-capture', `${label} capture missing`, { path: p, label });
    }
  }
  if (st.isDirectory()) {
    return refuse('capture-is-directory', `${label} path is a directory, not a capture file`, {
      path: p,
      label,
    });
  }
  if (!st.isFile()) {
    return refuse('capture-not-a-file', `${label} is not a regular file`, { path: p, label });
  }
  if (st.size > MAX_CAPTURE_BYTES) {
    return refuse('capture-too-large', `${label} exceeds documented ${MAX_CAPTURE_BYTES} byte limit`, {
      path: p,
      label,
      size: st.size,
      limit: MAX_CAPTURE_BYTES,
    });
  }
  return { ok: true, path: p, bytes: st.size };
}

function familyRefuse(familyId, recipeId, prep, extra = {}) {
  return {
    ok: false,
    refused: true,
    family: familyId,
    recipeId,
    prep,
    paidValueClaim: false,
    freeOffline: true,
    ...extra,
  };
}

function fileDigest(p) {
  const inspect = inspectCapture(p, 'input');
  if (!inspect.ok) return { path: p, bytes: null, sha256: null, observedAt: 'unknown', attribution: 'unknown' };
  const buf = fs.readFileSync(p);
  return {
    path: path.resolve(p),
    bytes: buf.length,
    sha256: createHash('sha256').update(buf).digest('hex'),
    observedAt: 'unknown',
    attribution: 'unknown',
  };
}

function matchSideMeta(digest, side) {
  if (!digest?.sha256 || !side || typeof side !== 'object') return digest;
  if (side.sha256 && side.sha256 === digest.sha256) {
    return {
      ...digest,
      attribution: 'source-meta-digest-match',
      commit: side.commit ?? null,
    };
  }
  return digest;
}

function loadRecipeSourceMeta(loaded) {
  const recipe = loaded?.recipe;
  const metaRel = recipe?.primarySource?.metaFile;
  if (typeof metaRel === 'string' && metaRel.trim()) {
    const full = path.resolve(S163, metaRel);
    if (isExistingFile(full)) {
      try {
        const st = fs.statSync(full);
        if (st.size <= MAX_CAPTURE_BYTES) {
          return JSON.parse(fs.readFileSync(full, 'utf8'));
        }
      } catch {
        return {
          synthetic: recipe.primarySource?.synthetic === true,
          label: recipe.primarySource?.label ?? null,
        };
      }
    }
  }
  if (recipe?.primarySource && typeof recipe.primarySource === 'object') {
    return {
      label: recipe.primarySource.label ?? null,
      sourceUrl: recipe.primarySource.sourceUrl ?? recipe.primarySource.repo ?? null,
      license: recipe.primarySource.license ?? null,
      synthetic: recipe.primarySource.synthetic === true,
      beforeCommit: recipe.primarySource.beforeCommit ?? null,
      afterCommit: recipe.primarySource.afterCommit ?? null,
    };
  }
  return null;
}

function bindProvenance({ before, after, used, priorManifest, recipeMeta }) {
  const currentInputs = {
    before: fileDigest(before),
    after: fileDigest(after),
    used: used ? fileDigest(used) : null,
  };
  const inherited = priorManifest?.sourceMeta && typeof priorManifest.sourceMeta === 'object'
    ? priorManifest.sourceMeta
    : recipeMeta && typeof recipeMeta === 'object'
      ? recipeMeta
      : null;
  const synthetic =
    inherited?.synthetic === true ||
    recipeMeta?.synthetic === true ||
    priorManifest?.synthetic === true
      ? true
      : inherited?.synthetic === false || recipeMeta?.synthetic === false
        ? false
        : undefined;

  let sourceMeta = null;
  let sourceMetaHistorical = null;
  if (inherited) {
    const beforeMatch = inherited.before?.sha256 && inherited.before.sha256 === currentInputs.before.sha256;
    const afterMatch = inherited.after?.sha256 && inherited.after.sha256 === currentInputs.after.sha256;
    if (beforeMatch && afterMatch) {
      sourceMeta = inherited;
      currentInputs.before = matchSideMeta(currentInputs.before, inherited.before);
      currentInputs.after = matchSideMeta(currentInputs.after, inherited.after);
    } else {
      sourceMetaHistorical = inherited;
      sourceMeta = {
        synthetic: synthetic === true,
        note: 'current capture bytes do not match inherited sourceMeta digests; current attribution unknown',
      };
    }
  } else if (recipeMeta) {
    sourceMeta = recipeMeta;
  }
  if (synthetic === true) {
    if (sourceMeta && typeof sourceMeta === 'object') sourceMeta = { ...sourceMeta, synthetic: true };
    currentInputs.synthetic = true;
  } else if (synthetic === false && sourceMeta && sourceMeta.synthetic == null) {
    sourceMeta = { ...sourceMeta, synthetic: false };
  }
  return { sourceMeta, sourceMetaHistorical, currentInputs };
}

function fileIdentity(p) {
  try {
    const resolved = path.resolve(p);
    const lst = fs.lstatSync(resolved);
    const st = lst.isSymbolicLink() ? fs.statSync(resolved) : lst;
    return {
      exists: true,
      resolved,
      real: lst.isSymbolicLink() ? fs.realpathSync(resolved) : resolved,
      dev: st.dev,
      ino: st.ino,
    };
  } catch {
    return { exists: false, resolved: path.resolve(p), real: path.resolve(p), dev: null, ino: null };
  }
}

function aliases(a, b) {
  if (!a || !b) return false;
  const A = fileIdentity(a);
  const B = fileIdentity(b);
  if (A.real === B.real) return true;
  if (A.exists && B.exists && A.dev != null && A.dev === B.dev && A.ino === B.ino) return true;
  return false;
}

function writeNext(file, manifest, protectedPaths = []) {
  if (typeof file !== 'string' || !file.trim()) {
    return refuse('invalid-next-run-path', '--write-next-run requires a file path');
  }
  const out = path.resolve(file);
  try {
    if (fs.existsSync(out) && fs.statSync(out).isDirectory()) {
      return refuse('next-run-path-is-directory', '--write-next-run must be a file, not a directory', { path: out });
    }
  } catch {
    /* continue */
  }
  for (const p of protectedPaths.filter(Boolean)) {
    if (aliases(out, p)) {
      return refuse(
        'next-run-would-overwrite-input',
        '--write-next-run must not alias before/after/used or the imported manifest',
        { path: out, protected: path.resolve(p) },
      );
    }
  }
  try {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const fd = fs.openSync(out, 'wx');
    try {
      fs.writeFileSync(fd, `${JSON.stringify(manifest, null, 2)}\n`);
    } finally {
      fs.closeSync(fd);
    }
    return { ok: true, path: out };
  } catch (e) {
    if (e && e.code === 'EEXIST') {
      return refuse('next-run-path-exists', '--write-next-run refuses to replace an existing file (exclusive create)', {
        path: out,
      });
    }
    return refuse('next-run-write-failed', String(e.message || e), { path: out });
  }
}

function attachNext(result, writeNextRun, man, protectedPaths) {
  if (!writeNextRun) return result;
  const written = writeNext(writeNextRun, man, protectedPaths);
  if (!written.ok) {
    result.nextRun = { refused: true, prep: written };
    return result;
  }
  result.nextRun = { path: written.path, manifest: man };
  return result;
}

function parserMatchesFamily(familyId, parser) {
  if (!parser) return true;
  const fam = FAMILIES[familyId];
  if (!fam) return false;
  if (parser === `s134-${fam.module}` || parser === fam.module) return true;
  return FAMILY_ALIASES[parser] === familyId;
}

function loadNextRunManifest(rawPath) {
  const resolved = resolveCliPath(rawPath);
  if (!resolved || !fs.existsSync(resolved)) {
    return {
      ok: false,
      refused: true,
      prep: refuse('missing-next-run-manifest', 'next-run manifest file missing', { path: resolved || rawPath }),
      paidValueClaim: false,
      freeOffline: true,
      fromNextRun: rawPath,
    };
  }
  let st;
  try {
    st = fs.statSync(resolved);
  } catch {
    return {
      ok: false,
      refused: true,
      prep: refuse('missing-next-run-manifest', 'next-run manifest file missing', { path: resolved }),
      paidValueClaim: false,
      freeOffline: true,
      fromNextRun: rawPath,
    };
  }
  if (st.isDirectory()) {
    return {
      ok: false,
      refused: true,
      prep: refuse('next-run-path-is-directory', 'next-run manifest must be a file, not a directory', { path: resolved }),
      paidValueClaim: false,
      freeOffline: true,
      fromNextRun: rawPath,
    };
  }
  if (st.size > MAX_CAPTURE_BYTES) {
    return {
      ok: false,
      refused: true,
      prep: refuse('capture-too-large', `next-run manifest exceeds documented ${MAX_CAPTURE_BYTES} byte limit`, {
        path: resolved,
        size: st.size,
        limit: MAX_CAPTURE_BYTES,
      }),
      paidValueClaim: false,
      freeOffline: true,
      fromNextRun: rawPath,
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (e) {
    return {
      ok: false,
      refused: true,
      prep: refuse('invalid-next-run-manifest', 'next-run manifest is not valid JSON', {
        path: resolved,
        error: String(e.message || e),
      }),
      paidValueClaim: false,
      freeOffline: true,
      fromNextRun: rawPath,
    };
  }
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      refused: true,
      prep: refuse('invalid-next-run-manifest', 'next-run manifest must be a JSON object', {
        path: resolved,
        got: parsed === null ? 'null' : Array.isArray(parsed) ? 'array' : typeof parsed,
      }),
      paidValueClaim: false,
      freeOffline: true,
      fromNextRun: rawPath,
    };
  }
  if (!NEXT_RUN_SCHEMAS.includes(parsed.schema)) {
    return {
      ok: false,
      refused: true,
      prep: refuse('unsupported-next-run-schema', 'next-run schema must be s176.next-run-manifest.v1 or s163.next-run-manifest.v1', {
        path: resolved,
        got: parsed.schema ?? null,
      }),
      paidValueClaim: false,
      freeOffline: true,
      fromNextRun: rawPath,
    };
  }
  const family = normalizeFamily(parsed.family || parsed.parser);
  if (!family || !FAMILIES[family]) {
    return {
      ok: false,
      refused: true,
      prep: refuse('unknown-family', 'next-run family/parser is not a declared S176 family', {
        family: parsed.family ?? null,
        parser: parsed.parser ?? null,
      }),
      paidValueClaim: false,
      freeOffline: true,
      fromNextRun: rawPath,
    };
  }
  if (parsed.parser && !parserMatchesFamily(family, parsed.parser)) {
    return {
      ok: false,
      refused: true,
      prep: refuse('family-parser-mismatch', 'next-run family does not match parser', {
        family,
        parser: parsed.parser,
      }),
      paidValueClaim: false,
      freeOffline: true,
      fromNextRun: rawPath,
    };
  }
  return { ok: true, path: resolved, manifest: parsed, family };
}

async function loadAdapter(file) {
  return import(pathToFileURL(path.join(S163, 'adapters', file)).href);
}

function runParser(moduleName, argv) {
  const cli = path.join(S134, 'modules', moduleName, 'cli.mjs');
  return spawnSync(process.execPath, [cli, ...argv], {
    encoding: 'utf8',
    cwd: PKG,
    maxBuffer: 20 * 1024 * 1024,
    timeout: PARSER_TIMEOUT_MS,
    killSignal: 'SIGTERM',
  });
}

function parseReport(stdout) {
  try {
    return JSON.parse(String(stdout || '').trim());
  } catch {
    return { parseError: true, stdout };
  }
}

function parserFailure(r) {
  if (r.error && r.error.code === 'ETIMEDOUT') {
    return refuse('parser-timeout', `parser exceeded ${PARSER_TIMEOUT_MS}ms`, { timeoutMs: PARSER_TIMEOUT_MS });
  }
  return null;
}

function loadRecipe(id) {
  const recipesRoot = path.join(S163, 'recipes');
  for (const fam of fs.readdirSync(recipesRoot)) {
    const dir = path.join(recipesRoot, fam);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      const full = path.join(dir, f);
      const recipe = JSON.parse(fs.readFileSync(full, 'utf8'));
      if (recipe.id === id || f === `${id}.json`) {
        return { recipe, familyDir: fam, path: full };
      }
    }
  }
  return null;
}

function normalizeFamily(id) {
  if (!id) return null;
  if (FAMILIES[id]) return id;
  if (FAMILY_ALIASES[id]) return FAMILY_ALIASES[id];
  const s = String(id);
  if (s.includes('openapi')) return 'openapi-used-ops';
  if (s.includes('pricing') || s.includes('price')) return 'pricing-row-unit';
  if (s.includes('csv')) return 'csv-keyed-drift';
  if (s.includes('rss') || s.includes('atom') || s.includes('feed')) return 'rss-atom-brief';
  return null;
}

function sampleCatalog() {
  return [
    { recipe: 'R-OPENAPI-PIN-IMPACT', family: 'openapi-used-ops', label: 'free-sample' },
    { recipe: 'R-PRICE-UNIT-CASE', family: 'pricing-row-unit', label: 'free-sample' },
    { recipe: 'R-PRICE-REFUSE-HTML', family: 'pricing-row-unit', label: 'unsupported' },
    { recipe: 'R-CSV-KEYED-CHANGE', family: 'csv-keyed-drift', label: 'free-sample-synthetic' },
    { recipe: 'R-CSV-DUP-IDENTITY', family: 'csv-keyed-drift', label: 'partial' },
    { recipe: 'R-CSV-REAL-NEWLINE', family: 'csv-keyed-drift', label: 'free-sample' },
    { recipe: 'R-FEED-LIVE-NOCHANGE', family: 'rss-atom-brief', label: 'free-sample' },
    { recipe: 'R-FEED-SYNTH-CORR-DEDUP', family: 'rss-atom-brief', label: 'free-sample-synthetic' },
  ];
}

function finishManifest(man, { familyId, recipeId, parser, provenance, extra = {} }) {
  const out = {
    recipeId: recipeId || familyId,
    family: familyId,
    parser,
    ...man,
    ...extra,
    schema: 's176.next-run-manifest.v1',
    sourceMeta: provenance.sourceMeta,
    currentInputs: provenance.currentInputs,
    paidValueClaim: false,
    freeOffline: true,
  };
  if (provenance.sourceMetaHistorical) out.sourceMetaHistorical = provenance.sourceMetaHistorical;
  if (man.retain && !out.retain) out.retain = man.retain;
  return out;
}

async function runFamily(familyId, inputs, {
  recipeId = null,
  writeNextRun = null,
  priorManifest = null,
  recipeMeta = null,
  resolvePath = resolveCliPath,
  importedManifestPath = null,
} = {}) {
  const fam = FAMILIES[familyId];
  if (!fam) return { ok: false, error: 'unknown-family', familyId };

  const before = resolvePath(inputs.before);
  const after = resolvePath(inputs.after);
  const used = inputs.used ? resolvePath(inputs.used) : null;
  const keyRaw = inputs.key;
  const keys = !keyRaw
    ? []
    : Array.isArray(keyRaw)
      ? keyRaw
      : String(keyRaw)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

  const missingByFamily = {
    'openapi-used-ops': 'missing-openapi-capture',
    'pricing-row-unit': 'missing-pricing-capture',
    'csv-keyed-drift': 'missing-csv-capture',
    'rss-atom-brief': 'missing-feed-capture',
  };
  const missingCode = missingByFamily[familyId] || 'missing-capture';
  for (const [label, p] of [
    ['before', before],
    ['after', after],
  ]) {
    const cap = inspectCapture(p, label, { missingCode });
    if (!cap.ok) return familyRefuse(familyId, recipeId, cap, { sourceLinked: true });
  }
  if (familyId === 'openapi-used-ops') {
    const cap = inspectCapture(used, 'used', { missingCode: 'empty-used-ops-pin' });
    if (!cap.ok) return familyRefuse(familyId, recipeId, cap, { sourceLinked: true });
  } else if (used) {
    const cap = inspectCapture(used, 'used', { missingCode });
    if (!cap.ok) return familyRefuse(familyId, recipeId, cap, { sourceLinked: true });
  }

  const provenance = bindProvenance({ before, after, used, priorManifest, recipeMeta });
  const protectedPaths = [before, after, used, importedManifestPath];

  if (familyId === 'openapi-used-ops') {
    const adapter = await loadAdapter(fam.adapter);
    let pinPrep;
    try {
      if (typeof used === 'string' && !isExistingFile(used)) {
        pinPrep = refuse('empty-used-ops-pin', 'used-ops pin must list operations[{method,path}|{operationId}]', { path: used });
      } else {
        pinPrep = adapter.buildOpenApiCliArgs({ before, after, usedPin: used, s134Root: S134 });
      }
    } catch (e) {
      pinPrep = refuse('invalid-used-op', 'used-ops pin is not valid JSON', {
        path: used,
        error: String(e.message || e),
      });
    }
    if (!pinPrep.ok) return familyRefuse(familyId, recipeId, pinPrep);
    const r = runParser(fam.module, ['--before', before, '--after', after, '--used', used]);
    const timed = parserFailure(r);
    if (timed) return familyRefuse(familyId, recipeId, timed);
    const report = parseReport(r.stdout);
    const result = {
      ok: r.status === 0 && !report.parseError,
      family: familyId,
      recipeId,
      exitCode: r.status,
      report,
      stderr: r.stderr || undefined,
      paidValueClaim: false,
      freeOffline: true,
      parser: `s134-${fam.module}`,
      inputs: { before, after, used },
      currentInputs: provenance.currentInputs,
    };
    if (writeNextRun) {
      const man = adapter.buildNextRunManifest(recipeId || familyId, {
        before,
        after,
        usedPin: used,
        sourceMeta: provenance.sourceMeta,
        lastReport: report?.report || report,
      });
      const finished = finishManifest(man, {
        familyId,
        recipeId,
        parser: result.parser,
        provenance,
      });
      attachNext(result, writeNextRun, finished, protectedPaths);
    }
    return result;
  }

  if (familyId === 'pricing-row-unit') {
    const adapter = await loadAdapter(fam.adapter);
    for (const [label, p] of [
      ['before', before],
      ['after', after],
    ]) {
      const prep = adapter.preparePricingTable(p, label);
      if (!prep.ok) {
        return familyRefuse(familyId, recipeId, prep, { sourceLinked: true });
      }
    }
    const r = runParser(fam.module, ['--before', before, '--after', after]);
    const timed = parserFailure(r);
    if (timed) return familyRefuse(familyId, recipeId, timed);
    const report = parseReport(r.stdout);
    const result = {
      ok: r.status === 0 && !report.parseError,
      family: familyId,
      recipeId,
      exitCode: r.status,
      report,
      stderr: r.stderr || undefined,
      paidValueClaim: false,
      freeOffline: true,
      parser: `s134-${fam.module}`,
      inputs: { before, after },
      currentInputs: provenance.currentInputs,
    };
    if (writeNextRun) {
      const finished = finishManifest(
        {
          inputs: { before, after },
          retain: ['units', 'coverage', 'sourceUrl', 'license', 'citations'],
        },
        { familyId, recipeId, parser: result.parser, provenance },
      );
      attachNext(result, writeNextRun, finished, protectedPaths);
    }
    return result;
  }

  if (familyId === 'csv-keyed-drift') {
    const adapter = await loadAdapter(fam.adapter);
    const prep = adapter.prepareKeyedCsvPair({ before, after, keyColumns: keys });
    if (!prep.ok) return familyRefuse(familyId, recipeId, prep);
    const argv = ['--before', before, '--after', after];
    for (const k of prep.keyColumns) argv.push('--key', k);
    const r = runParser(fam.module, argv);
    const timed = parserFailure(r);
    if (timed) return familyRefuse(familyId, recipeId, timed);
    const report = parseReport(r.stdout);
    const result = {
      ok: r.status === 0 && !report.parseError,
      family: familyId,
      recipeId,
      exitCode: r.status,
      report,
      stderr: r.stderr || undefined,
      paidValueClaim: false,
      freeOffline: true,
      parser: `s134-${fam.module}`,
      inputs: { before, after, key: prep.keyColumns },
      currentInputs: provenance.currentInputs,
    };
    if (writeNextRun) {
      const man = adapter.buildNextRunManifest(recipeId || familyId, prep, provenance.sourceMeta);
      const finished = finishManifest(man, {
        familyId,
        recipeId,
        parser: result.parser,
        provenance,
      });
      attachNext(result, writeNextRun, finished, protectedPaths);
    }
    return result;
  }

  if (familyId === 'rss-atom-brief') {
    const adapter = await loadAdapter(fam.adapter);
    for (const p of [before, after]) {
      const prep = adapter.prepareFeedCapture(p);
      if (!prep.ok) return familyRefuse(familyId, recipeId, prep);
    }
    const r = runParser(fam.module, ['--before', before, '--after', after]);
    const timed = parserFailure(r);
    if (timed) return familyRefuse(familyId, recipeId, timed);
    const report = parseReport(r.stdout);
    const result = {
      ok: r.status === 0 && !report.parseError,
      family: familyId,
      recipeId,
      exitCode: r.status,
      report,
      stderr: r.stderr || undefined,
      paidValueClaim: false,
      freeOffline: true,
      parser: `s134-${fam.module}`,
      inputs: { before, after },
      currentInputs: provenance.currentInputs,
    };
    if (writeNextRun) {
      const finished = finishManifest(
        {
          inputs: { before, after },
          retain: ['sourceUrl', 'license', 'format', 'synthetic'],
        },
        { familyId, recipeId, parser: result.parser, provenance },
      );
      attachNext(result, writeNextRun, finished, protectedPaths);
    }
    return result;
  }

  return { ok: false, error: 'unhandled-family', familyId };
}

async function runRecipe(recipeId, writeNextRun) {
  const loaded = loadRecipe(recipeId);
  if (!loaded) return { ok: false, error: 'recipe-not-found', recipeId };
  const { recipe, familyDir } = loaded;
  const family = normalizeFamily(recipe.family || familyDir);
  const inputs = recipe.inputs || {};
  const recipeMeta = loadRecipeSourceMeta(loaded);

  if (inputs.html || recipeId === 'R-PRICE-REFUSE-HTML') {
    const adapter = await loadAdapter('pricing-row-unit.mjs');
    const htmlPath = resolveRecipePath(inputs.html);
    const cap = inspectCapture(htmlPath, 'html');
    if (!cap.ok) {
      return familyRefuse('pricing-row-unit', recipeId, cap, { sourceLinked: true });
    }
    const prep = adapter.preparePricingTable(htmlPath, 'html');
    return familyRefuse('pricing-row-unit', recipeId, prep, { sourceLinked: true });
  }

  return runFamily(
    family,
    {
      before: inputs.before,
      after: inputs.after,
      used: inputs.used,
      key: inputs.key || inputs.keyColumns,
    },
    { recipeId, writeNextRun, recipeMeta, resolvePath: resolveRecipePath },
  );
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];

if (!cmd || cmd === 'help' || args.help) {
  help();
  process.exit(0);
}

if (cmd === 'list') {
  const registry = JSON.parse(fs.readFileSync(path.join(S163, 'registry/recipes.json'), 'utf8'));
  emit({
    packageId: 'record-repeat-job',
    session: 's176',
    s134Root: S134,
    s163Root: S163,
    registryPin: registry.s134Pin || null,
    families: Object.entries(FAMILIES).map(([id, meta]) => ({
      id,
      module: meta.module,
      sampleRecipe: meta.sampleRecipe,
    })),
    registryFamilies: registry.families,
    paidValueClaim: false,
    freeOffline: true,
    maxCaptureBytes: MAX_CAPTURE_BYTES,
    parserTimeoutMs: PARSER_TIMEOUT_MS,
    botRecordCellsExcluded: ['native05', 'native06', 'native07', 'native08'],
  });
}

if (cmd === 'sample') {
  if (args.list) emit({ samples: sampleCatalog(), paidValueClaim: false, freeOffline: true });
  if (args.all) {
    const results = [];
    for (const s of sampleCatalog()) {
      const r = await runRecipe(s.recipe, null);
      results.push({
        sample: s,
        result: {
          ok: r.ok,
          refused: Boolean(r.refused),
          family: r.family,
          recipeId: r.recipeId,
          exitCode: r.exitCode ?? null,
        },
      });
    }
    emit({ ok: true, results, paidValueClaim: false, freeOffline: true });
  }
  if (args.recipe) {
    const r = await runRecipe(args.recipe, args['write-next-run'] || null);
    emit(r, r.ok || r.refused ? 0 : 1);
  }
  if (args.family) {
    const familyId = normalizeFamily(args.family);
    const fam = familyId && FAMILIES[familyId];
    if (!fam) emit({ ok: false, error: 'unknown-family' }, 2);
    const r = await runRecipe(fam.sampleRecipe, args['write-next-run'] || null);
    emit(r, r.ok || r.refused ? 0 : 1);
  }
  emit({ ok: false, error: 'sample-requires --list|--all|--family|--recipe' }, 2);
}

if (cmd === 'run') {
  if (args.recipe) {
    const r = await runRecipe(args.recipe, args['write-next-run'] || null);
    emit(r, r.ok || r.refused ? 0 : 1);
  }
  if (args['from-next-run']) {
    const loaded = loadNextRunManifest(args['from-next-run']);
    if (!loaded.ok) emit(loaded, 0);
    const man = loaded.manifest;
    const family = loaded.family;
    const manDir = path.dirname(loaded.path);
    const legacyS163 = man.schema === 's163.next-run-manifest.v1';
    const resolveMixed = (cliVal, manVal) => {
      if (cliVal) return resolveCliPath(cliVal);
      return resolveManifestPath(manVal, manDir, { legacyS163 });
    };
    const inputs = {
      before: resolveMixed(args.before, man.inputs?.before),
      after: resolveMixed(args.after, man.inputs?.after),
      used: resolveMixed(args.used, man.inputs?.used || man.inputs?.usedPin),
      key: args.key || man.inputs?.key || man.inputs?.keyColumns,
    };
    const r = await runFamily(family, inputs, {
      recipeId: man.recipeId || null,
      writeNextRun: args['write-next-run'] || null,
      priorManifest: man,
      resolvePath: (p) => p,
      importedManifestPath: loaded.path,
    });
    r.fromNextRun = args['from-next-run'];
    emit(r, r.ok || r.refused ? 0 : 1);
  }
  if (args.family) {
    const family = normalizeFamily(args.family) || args.family;
    const r = await runFamily(
      family,
      { before: args.before, after: args.after, used: args.used, key: args.key },
      { writeNextRun: args['write-next-run'] || null, resolvePath: resolveCliPath },
    );
    emit(r, r.ok || r.refused ? 0 : 1);
  }
  emit({ ok: false, error: 'run-requires --family|--recipe|--from-next-run' }, 2);
}

emit({ ok: false, error: 'unknown-command', cmd }, 2);
