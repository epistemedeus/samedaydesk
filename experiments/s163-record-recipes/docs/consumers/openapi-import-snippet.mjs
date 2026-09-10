#!/usr/bin/env node
/**
 * Documentation sample for family openapi-used-ops.
 *
 * compareOpenApiImpact is exported from the S134 CLI module — import it.
 * Do not copy parser source. Pin 65ce1867. paidValueClaim: false.
 *
 *   node docs/consumers/openapi-import-snippet.mjs
 *
 * Literal CLI (cwd = experiments/s163-record-recipes) if import is unavailable:
 *
 *   node ../s134-record-jobs/modules/openapi-impact/cli.mjs \
 *     --before sources/openapi/museum/before.yaml \
 *     --after sources/openapi/museum/after.yaml \
 *     --used sources/openapi/museum/used-ops.pin.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareOpenApiImpact } from '../../../s134-record-jobs/modules/openapi-impact/cli.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const museum = path.join(root, 'sources/openapi/museum');

const report = compareOpenApiImpact({
  beforeText: fs.readFileSync(path.join(museum, 'before.yaml'), 'utf8'),
  afterText: fs.readFileSync(path.join(museum, 'after.yaml'), 'utf8'),
  usedSpec: JSON.parse(fs.readFileSync(path.join(museum, 'used-ops.pin.json'), 'utf8')),
});

const impact = report.impact || {};
process.stdout.write(
  `${JSON.stringify(
    {
      sample: 'openapi-import-snippet',
      ok: report.ok,
      scope: report.scope,
      usedOperationCount: report.usedOperationCount,
      impact: {
        changed: impact.changed?.length ?? 0,
        unchanged: impact.unchanged?.length ?? 0,
      },
      paidValueClaim: false,
      runtimeCompatibilityProof: false,
    },
    null,
    2,
  )}\n`,
);
