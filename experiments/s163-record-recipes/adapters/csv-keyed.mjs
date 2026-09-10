/**
 * Keyed CSV prep for s134-csv-drift.
 * Retains source coverage fields; does not invent keys.
 */
import fs from 'node:fs';
import path from 'node:path';
import { refuse } from './refuse-unsupported.mjs';

export function prepareKeyedCsvPair({ before, after, keyColumns }) {
  const keys = Array.isArray(keyColumns) ? keyColumns : keyColumns ? [keyColumns] : [];
  if (!keys.length) return refuse('missing-key-columns', 'keyColumns required for keyed drift recipe');
  for (const p of [before, after]) {
    if (!fs.existsSync(p)) return refuse('missing-csv-capture', 'CSV capture file missing', { path: p });
    const text = fs.readFileSync(p, 'utf8');
    if (!text.trim()) return refuse('empty-csv-capture', 'CSV capture empty', { path: p });
  }
  return {
    ok: true,
    before,
    after,
    keyColumns: keys,
    retain: ['keyColumns', 'sourceUrl', 'commit', 'license', 'coverage'],
    paidValueClaim: false,
  };
}

export function buildCsvCliArgs({ before, after, keyColumns, s134Root }) {
  const prep = prepareKeyedCsvPair({ before, after, keyColumns });
  if (!prep.ok) return prep;
  const cli = path.join(s134Root, 'modules/csv-drift/cli.mjs');
  const argv = [cli, '--before', before, '--after', after];
  for (const k of prep.keyColumns) argv.push('--key', k);
  return { ok: true, argv, prep };
}

export function buildNextRunManifest(recipeId, prep, sourceMeta) {
  if (!prep?.ok) return prep;
  return {
    schema: 's163.next-run-manifest.v1',
    recipeId,
    parser: 's134-csv-drift',
    inputs: { before: prep.before, after: prep.after, keyColumns: prep.keyColumns },
    sourceMeta: sourceMeta || null,
    uncertaintyNotes: [
      'Blank key values are weak identities — treat as uncertainty, not silent merge.',
      'Duplicate keys block definitive keyed counts (S142/S154 gate).',
    ],
    paidValueClaim: false,
  };
}
