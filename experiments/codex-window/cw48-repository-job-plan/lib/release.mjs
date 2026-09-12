import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseCatalog, findJob } from '../../../../tools/job-input-preflight/lib/catalog.mjs';
import { preflight } from '../../../../tools/job-input-preflight/lib/preflight.mjs';
import { routeJob } from '../../../../tools/offer-routing/route-job.mjs';
import { sha256, refuse } from './git.mjs';

export const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
export const JOBS = ['lockfile-pin-delta', 'json-schema-webhook-drift', 'route-table-diff', 'vendor-budget-impact', 'page-change-offline-job'];
export { preflight, findJob };

// The payment wrapper deliberately remains on 1.0.0. Read the actual public
// release here, without importing payment execution or manufacturing prices.
export function unpackRelease(out) {
  const publicRoot = join(SOURCE_ROOT, 'client/public');
  const discovery = JSON.parse(readFileSync(join(publicRoot, 'discovery/useful-jobs.json')));
  if (!/^\d+\.\d+\.\d+$/.test(discovery.version)) refuse('invalid_release');
  const name = `useful-jobs-${discovery.version}`;
  const meta = JSON.parse(readFileSync(join(publicRoot, 'for-agents/useful-jobs', `${name}.sha256.json`)));
  const archive = readFileSync(join(publicRoot, 'for-agents/useful-jobs', `${name}.tar.gz`));
  if (archive.length !== meta.bytes || sha256(archive) !== meta.sha256 || meta.sha256 !== discovery.sha256 || meta.bytes !== discovery.bytes) refuse('release_pin_mismatch');
  // Extract the bytes just verified, never reopen the mutable source archive.
  const r = spawnSync('tar', ['-xzf', '-', '-C', out], { input: archive, timeout: 10000, maxBuffer: 1024 * 1024 });
  if (r.error || r.status !== 0) refuse('release_extract_failed');
  const kit = join(out, name);
  const catalogBytes = readFileSync(join(kit, 'catalog.json'));
  const catalog = parseCatalog(JSON.parse(catalogBytes));
  if (catalog.version !== discovery.version) refuse('release_catalog_mismatch');
  return { kit, catalog, identity: { package: catalog.package, version: catalog.version, archiveSha256: meta.sha256, archiveBytes: meta.bytes, catalogSha256: sha256(catalogBytes), archiveMetadataSourceCommit: meta.sourceCommit, discoverySourceCommit: discovery.pins?.sourceCommit ?? null, localRoot: name } };
}

export async function exactInputPreflight({ release, job, before, after, binding, dir, limits }) {
  const imp = (id, file) => import(pathToFileURL(join(release.kit, 'engines', id, 'lib', file)).href);
  let flags = { before: join(dir, 'before.json'), after: join(dir, 'after.json') };
  let rows = 0;
  if (job.id === 'lockfile-pin-delta') {
    const { parseLockfileText } = await imp(job.id, 'parse-lockfile.mjs');
    for (const value of [before, after]) rows += parseLockfileText(JSON.stringify(value)).pins.length;
  } else if (job.id === 'json-schema-webhook-drift') {
    const { parseUsedSpec, assertComparableKind, detectDocumentKind } = await imp(job.id, 'parse.mjs');
    const { remoteRefsInNode } = await imp(job.id, 'refs.mjs');
    assertComparableKind(detectDocumentKind(before), detectDocumentKind(after));
    const used = parseUsedSpec(binding.used);
    if (!used.pointers.length || used.uncertainties.length || used.pointers.some(p => !/^(?:\/(?:[^~]|~[01])*)*$/.test(p))) refuse('used_pointers_required');
    if (remoteRefsInNode(before).length || remoteRefsInNode(after).length) refuse('remote_ref_refused');
    flags.used = join(dir, 'used.json');
    writeFileSync(flags.used, JSON.stringify(binding.used));
    rows = used.pointers.length;
  } else if (job.id === 'route-table-diff') {
    const { loadCatalogDocument } = await imp(job.id, 'catalog.mjs');
    for (const value of [before, after]) rows += loadCatalogDocument(value, 'caller-revision.json').records.length;
  } else if (job.id === 'vendor-budget-impact') {
    rows = (before.rows?.length || 0) + (after.rows?.length || 0);
    // Existing preflight supplies the pricing schema authority below. Tighten
    // the published CLI's whitespace-only identity rejection before selection.
    for (const doc of [before, after]) for (const row of doc.rows || []) if (typeof row?.field === 'string' && !row.field.trim() || typeof row?.unit === 'string' && !row.unit.trim()) refuse('input-schema-mismatch');
  } else if (job.id === 'page-change-offline-job') {
    const { parseExtractBatch } = await imp(job.id, 'parse-batch.mjs');
    const { DEFAULT_LIMITS } = await imp(job.id, 'constants.mjs');
    const { normalizeFields } = await imp(job.id, 'fields.mjs');
    const { requireClock } = await imp(job.id, 'clock.mjs');
    const fields = normalizeFields(binding.fields);
    const clock = requireClock(binding.clock);
    if (!Number.isFinite(Date.parse(clock))) refuse('clock_required');
    for (const doc of [before, after]) { const batch = parseExtractBatch(doc, { ...DEFAULT_LIMITS, maxSources: limits.maxRows }); if (!batch.kind || batch.truncated) refuse('invalid_or_truncated_page_capture'); rows += batch.rows.length; }
    const jobFile = join(dir, 'job.json');
    writeFileSync(jobFile, JSON.stringify({ before: './before.json', after: './after.json', fields, clock, limits: { maxBytes: limits.maxFileBytes, maxSources: limits.maxRows, maxChanges: limits.maxRows } }));
    flags = { job: jobFile };
  }
  if (rows > limits.maxRows) refuse('row_limit');
  // --out-dir is an output flag, although two public jobs list it as required.
  // Normalize only that CLI argument before handing input validation to preflight.
  const inputJob = { ...job, requiredInputs: job.requiredInputs.filter(f => f !== '--out-dir'), optionalInputs: (job.optionalInputs || []).filter(f => f !== '--out-dir') };
  const result = preflight({ catalog: release.catalog, job: inputJob, flags, inputRoot: dir, outDir: join(dir, 'preflight') });
  if (!result.ok) refuse('preflight_failed');
  // The generated page document uses sibling before/after names. Its original
  // private bundle paths preserve those references; preflight's nested capture
  // aliases belong to its wrapper contract, not the released CLI's job document.
  return { rows, flags, receipt: 'preflight/preflight.json', routeAdvice: job.id === 'page-change-offline-job' ? routeJob({ type: 'page_change_evidence', constraints: ['offline_only', 'no_payment'] }).selected?.offerId ?? null : null };
}
