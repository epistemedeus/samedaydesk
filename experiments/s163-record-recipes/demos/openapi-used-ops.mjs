#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, s134Module, runNode, parseCliJson } from './lib.mjs';
import { loadUsedOpsPin, buildNextRunManifest } from '../adapters/openapi-used-ops.mjs';

const before = path.join(ROOT, 'sources/openapi/museum/before.yaml');
const after = path.join(ROOT, 'sources/openapi/museum/after.yaml');
const used = path.join(ROOT, 'sources/openapi/museum/used-ops.pin.json');

const pin = loadUsedOpsPin(used);
if (!pin.ok) {
  console.error(pin);
  process.exit(2);
}

const r = runNode(s134Module('openapi-impact'), ['--before', before, '--after', after, '--used', used]);
if (r.status !== 0) {
  console.error(r.stderr || r.stdout);
  process.exit(r.status || 1);
}
const out = parseCliJson(r.stdout);
const report = out.report || out;
const manifest = buildNextRunManifest('R-OPENAPI-PIN-IMPACT', {
  before: 'sources/openapi/museum/before.yaml',
  after: 'sources/openapi/museum/after.yaml',
  usedPin: 'sources/openapi/museum/used-ops.pin.json',
  sourceMeta: JSON.parse(fs.readFileSync(path.join(ROOT, 'sources/openapi/museum/SOURCE.json'), 'utf8')),
  lastReport: report,
});
fs.mkdirSync(path.join(ROOT, 'next-run'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'next-run/R-OPENAPI-PIN-IMPACT.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      demo: 'openapi-used-ops',
      ok: report.ok,
      usedOperationCount: report.usedOperationCount,
      impact: {
        changed: report.impact?.changed?.length ?? 0,
        unchanged: report.impact?.unchanged?.length ?? 0,
      },
      nextRunManifest: 'next-run/R-OPENAPI-PIN-IMPACT.manifest.json',
      note: 'Pinned used-ops may stay unchanged while document-level webhook edits land outside scope.',
    },
    null,
    2,
  ),
);
