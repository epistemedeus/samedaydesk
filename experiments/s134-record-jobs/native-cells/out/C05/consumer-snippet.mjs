/**
 * C05 cold-consumer: import compareOpenApiImpact; print uncertainty codes only.
 * Local fixtures. No network. Does not claim paid value.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareOpenApiImpact } from '../../../modules/openapi-impact/cli.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const report = compareOpenApiImpact({
  beforeText: read('fixtures/openapi/unknown/before.json'),
  afterText: read('fixtures/openapi/unknown/after.json'),
  usedSpec: JSON.parse(read('fixtures/openapi/unknown/used.json')),
});

for (const u of report.uncertainties ?? []) {
  process.stdout.write(`${u.code}\n`);
}
