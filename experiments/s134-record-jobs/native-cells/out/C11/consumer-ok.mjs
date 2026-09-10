#!/usr/bin/env node
/**
 * C11 cold-consumer: import comparePricingTables on local unknown-shape
 * fixtures; print report.ok only. No network, no paid fetch.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { comparePricingTables } from '../../../modules/pricing-table-change/cli.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const before = JSON.parse(
  fs.readFileSync(path.join(root, 'fixtures/pricing/unknown/before.json'), 'utf8'),
);
const after = JSON.parse(
  fs.readFileSync(path.join(root, 'fixtures/pricing/unknown/after.json'), 'utf8'),
);
const report = comparePricingTables(before, after);
process.stdout.write(`${report.ok}\n`);
