#!/usr/bin/env node
/**
 * C18 cold-consumer: import compareCsvDrift on local positive CSV fixtures.
 * Cash $0. No network. Prints schema.columnsAdded and rowDrift.addedCount only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareCsvDrift } from '../../../modules/csv-drift/cli.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const beforePath = path.join(root, 'fixtures/csv/positive/before.csv');
const afterPath = path.join(root, 'fixtures/csv/positive/after.csv');

const report = compareCsvDrift(fs.readFileSync(beforePath, 'utf8'), fs.readFileSync(afterPath, 'utf8'), {
  keyColumns: ['sku'],
});

process.stdout.write(
  `${JSON.stringify(
    {
      schema: { columnsAdded: report.schema?.columnsAdded ?? null },
      rowDrift: { addedCount: report.rowDrift?.addedCount ?? null },
    },
    null,
    2,
  )}\n`,
);
