#!/usr/bin/env node
import path from 'node:path';
import { ROOT, s134Module, runNode, parseCliJson } from './lib.mjs';
import { prepareKeyedCsvPair, buildNextRunManifest } from '../adapters/csv-keyed.mjs';
import fs from 'node:fs';

function runPair(label, beforeRel, afterRel) {
  const before = path.join(ROOT, beforeRel);
  const after = path.join(ROOT, afterRel);
  const prep = prepareKeyedCsvPair({ before, after, keyColumns: ['airline'] });
  if (!prep.ok) throw new Error(JSON.stringify(prep));
  const r = runNode(s134Module('csv-drift'), ['--before', before, '--after', after, '--key', 'airline']);
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return { label, report: parseCliJson(r.stdout).report, prep };
}

const keyed = runPair(
  'synthetic-keyed',
  'sources/csv/airline-safety/synthetic-keyed-before.csv',
  'sources/csv/airline-safety/synthetic-keyed-after.csv',
);
const dup = runPair(
  'synthetic-dup',
  'sources/csv/airline-safety/synthetic-dup-before.csv',
  'sources/csv/airline-safety/synthetic-dup-after.csv',
);
const real = runPair('real-newline', 'sources/csv/airline-safety/before.csv', 'sources/csv/airline-safety/after.csv');

const manifest = buildNextRunManifest(
  'R-CSV-KEYED-CHANGE',
  keyed.prep,
  JSON.parse(fs.readFileSync(path.join(ROOT, 'sources/csv/airline-safety/SOURCE.json'), 'utf8')),
);
fs.mkdirSync(path.join(ROOT, 'next-run'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'next-run/R-CSV-KEYED-CHANGE.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      demo: 'csv-keyed-drift',
      keyed: {
        mode: keyed.report.rowDrift?.mode,
        changedCount: keyed.report.rowDrift?.changedCount,
        addedCount: keyed.report.rowDrift?.addedCount,
      },
      dup: { mode: dup.report.rowDrift?.mode },
      real: {
        mode: real.report.rowDrift?.mode,
        changedCount: real.report.rowDrift?.changedCount,
        note: 'Real commit pair may be newline-only; changedCount=0 is valid.',
      },
      nextRunManifest: 'next-run/R-CSV-KEYED-CHANGE.manifest.json',
    },
    null,
    2,
  ),
);
