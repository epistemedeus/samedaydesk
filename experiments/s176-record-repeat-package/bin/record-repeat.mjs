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
  process.stdout.write(`record-repeat — SameDayDesk S176 shared acquisition CLI

Commands:
  list
  sample --list | --all | --family <id> | --recipe <id>
  run --family <id> --before <f> --after <f> [--used <f>] [--key col[,col]] [--write-next-run <out>]
  run --recipe <id> [--write-next-run <out>]
  run --from-next-run <manifest> --before <f> --after <f> [--used <f>] [--key col] [--write-next-run <out>]

Families: ${Object.keys(FAMILIES).join(', ')}

Free offline processing of local artifacts. Optional existing paid merchant extract is separate.
Unsupported HTML / missing identity / missing units stay explicit — never synthesized.
Bot Record cell ids native05..08 are out of scope.
`);
}

function resolveMaybe(p, extraBases = []) {
  if (p == null || p === true) return null;
  if (path.isAbsolute(p)) return p;
  const bases = [process.cwd(), ...extraBases, PKG, S163, S134];
  for (const base of bases) {
    if (!base) continue;
    const cand = path.resolve(base, p);
    if (fs.existsSync(cand)) return cand;
  }
  return path.resolve(process.cwd(), p);
}

function isExistingFile(p) {
  try {
    return Boolean(p) && fs.existsSync(p) && fs.statSync(p).isFile();
  } catch {
    return false;
  }
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

function inheritPrior(man, prior) {
  if (!prior) return man;
  if (man.sourceMeta == null && prior.sourceMeta != null) man.sourceMeta = prior.sourceMeta;
  if (man.retain == null && Array.isArray(prior.retain)) man.retain = prior.retain;
  if (man.uncertaintyNotes == null && prior.uncertaintyNotes != null) man.uncertaintyNotes = prior.uncertaintyNotes;
  if (man.coverage == null && prior.coverage != null) man.coverage = prior.coverage;
  man.paidValueClaim = false;
  return man;
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
  });
}

function parseReport(stdout) {
  try {
    return JSON.parse(String(stdout || '').trim());
  } catch {
    return { parseError: true, stdout };
  }
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

function writeNext(file, manifest) {
  if (typeof file !== 'string' || !file.trim()) {
    return refuse('invalid-next-run-path', '--write-next-run requires a file path');
  }
  const out = path.resolve(file);
  try {
    if (fs.existsSync(out) && fs.statSync(out).isDirectory()) {
      return refuse('next-run-path-is-directory', '--write-next-run must be a file, not a directory', { path: out });
    }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
    return { ok: true, path: out };
  } catch (e) {
    return refuse('next-run-write-failed', String(e.message || e), { path: out });
  }
}

function attachNext(result, writeNextRun, man) {
  if (!writeNextRun) return result;
  const written = writeNext(writeNextRun, man);
  if (!written.ok) {
    result.nextRun = { refused: true, prep: written };
    return result;
  }
  result.nextRun = { path: written.path, manifest: man };
  return result;
}

function loadNextRunManifest(rawPath) {
  const resolved = resolveMaybe(rawPath);
  if (!isExistingFile(resolved)) {
    return {
      ok: false,
      refused: true,
      prep: refuse('missing-next-run-manifest', 'next-run manifest file missing', { path: resolved || rawPath }),
      paidValueClaim: false,
      freeOffline: true,
      fromNextRun: rawPath,
    };
  }
  try {
    return { ok: true, path: resolved, manifest: JSON.parse(fs.readFileSync(resolved, 'utf8')) };
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

async function runFamily(familyId, inputs, { recipeId = null, writeNextRun = null, priorManifest = null, resolveBases = [] } = {}) {
  const fam = FAMILIES[familyId];
  if (!fam) return { ok: false, error: 'unknown-family', familyId };

  const before = resolveMaybe(inputs.before, resolveBases);
  const after = resolveMaybe(inputs.after, resolveBases);
  const used = inputs.used ? resolveMaybe(inputs.used, resolveBases) : null;
  const keyRaw = inputs.key;
  const keys = !keyRaw
    ? []
    : Array.isArray(keyRaw)
      ? keyRaw
      : String(keyRaw)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

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
    };
    if (writeNextRun) {
      const man = adapter.buildNextRunManifest(recipeId || familyId, {
        before,
        after,
        usedPin: used,
        sourceMeta: priorManifest?.sourceMeta ?? null,
        lastReport: report?.report || report,
      });
      man.schema = man.schema || 's176.next-run-manifest.v1';
      man.family = familyId;
      man.freeOffline = true;
      man.paidValueClaim = false;
      inheritPrior(man, priorManifest);
      attachNext(result, writeNextRun, man);
    }
    return result;
  }

  if (familyId === 'pricing-row-unit') {
    const adapter = await loadAdapter(fam.adapter);
    // HTML refuse path: after or before may be HTML
    for (const [label, p] of [
      ['before', before],
      ['after', after],
    ]) {
      if (!p || !isExistingFile(p)) {
        return familyRefuse(
          familyId,
          recipeId,
          refuse('missing-pricing-capture', `${label} pricing capture missing`, { path: p }),
          { sourceLinked: true },
        );
      }
      const prep = adapter.preparePricingTable(p, label);
      if (!prep.ok) {
        return familyRefuse(familyId, recipeId, prep, { sourceLinked: true });
      }
    }
    const r = runParser(fam.module, ['--before', before, '--after', after]);
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
    };
    if (writeNextRun) {
      const man = inheritPrior(
        {
          schema: 's176.next-run-manifest.v1',
          recipeId: recipeId || familyId,
          family: familyId,
          parser: result.parser,
          inputs: { before, after },
          retain: ['units', 'coverage', 'sourceUrl', 'license', 'citations'],
          paidValueClaim: false,
          freeOffline: true,
        },
        priorManifest,
      );
      attachNext(result, writeNextRun, man);
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
    };
    if (writeNextRun) {
      const man = adapter.buildNextRunManifest(recipeId || familyId, prep, priorManifest?.sourceMeta ?? null);
      man.schema = man.schema || 's176.next-run-manifest.v1';
      man.family = familyId;
      man.freeOffline = true;
      man.paidValueClaim = false;
      inheritPrior(man, priorManifest);
      attachNext(result, writeNextRun, man);
    }
    return result;
  }

  if (familyId === 'rss-atom-brief') {
    const adapter = await loadAdapter(fam.adapter);
    for (const p of [before, after]) {
      if (p == null) {
        return familyRefuse(familyId, recipeId, refuse('missing-feed-capture', 'feed capture missing', { path: p }));
      }
      const prep = adapter.prepareFeedCapture(p);
      if (!prep.ok) return familyRefuse(familyId, recipeId, prep);
    }
    const r = runParser(fam.module, ['--before', before, '--after', after]);
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
    };
    if (writeNextRun) {
      const man = inheritPrior(
        {
          schema: 's176.next-run-manifest.v1',
          recipeId: recipeId || familyId,
          family: familyId,
          parser: result.parser,
          inputs: { before, after },
          retain: ['sourceUrl', 'license', 'format', 'synthetic'],
          paidValueClaim: false,
          freeOffline: true,
        },
        priorManifest,
      );
      attachNext(result, writeNextRun, man);
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

  // HTML refuse recipe
  if (inputs.html || recipeId === 'R-PRICE-REFUSE-HTML') {
    const adapter = await loadAdapter('pricing-row-unit.mjs');
    const htmlPath = resolveMaybe(inputs.html);
    if (!isExistingFile(htmlPath)) {
      return familyRefuse(
        'pricing-row-unit',
        recipeId,
        refuse('missing-pricing-capture', 'html pricing capture missing', { path: htmlPath }),
        { sourceLinked: true },
      );
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
    { recipeId, writeNextRun },
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
    const family = normalizeFamily(man.family || man.parser);
    const manDir = path.dirname(loaded.path);
    const inputs = {
      before: args.before || man.inputs?.before,
      after: args.after || man.inputs?.after,
      used: args.used || man.inputs?.used || man.inputs?.usedPin,
      key: args.key || man.inputs?.key || man.inputs?.keyColumns,
    };
    const r = await runFamily(family, inputs, {
      recipeId: man.recipeId || null,
      writeNextRun: args['write-next-run'] || null,
      priorManifest: man,
      resolveBases: [manDir],
    });
    r.fromNextRun = args['from-next-run'];
    emit(r, r.ok || r.refused ? 0 : 1);
  }
  if (args.family) {
    const family = normalizeFamily(args.family) || args.family;
    const r = await runFamily(
      family,
      { before: args.before, after: args.after, used: args.used, key: args.key },
      { writeNextRun: args['write-next-run'] || null },
    );
    emit(r, r.ok || r.refused ? 0 : 1);
  }
  emit({ ok: false, error: 'run-requires --family|--recipe|--from-next-run' }, 2);
}

emit({ ok: false, error: 'unknown-command', cmd }, 2);
