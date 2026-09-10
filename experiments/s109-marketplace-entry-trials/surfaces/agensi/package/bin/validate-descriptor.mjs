#!/usr/bin/env node
/**
 * Offline JSON Schema validation for the Agensi sanitized offer descriptor.
 * Does not hit Cloudflare Access, list skills, or spend.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  refuseForbiddenArgs,
  validateAgensiPackage,
} from '../lib/validate-package.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(__dirname, '..');

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  process.stdout.write(`Usage: validate-descriptor.mjs [descriptor.json]

Validates offer-descriptor.json against offer-descriptor.schema.json offline,
and cross-checks listing-checklist.json + access-handoff.json.

Does not authenticate, list, or spend. Cash boundary $0.
`);
  process.exit(0);
}

const forbidden = refuseForbiddenArgs(argv);
if (forbidden) {
  console.error(JSON.stringify(forbidden, null, 2));
  process.exit(2);
}

const descriptorPath = argv.find((a) => !a.startsWith('-')) || path.join(PKG, 'offer-descriptor.json');
const report = validateAgensiPackage(PKG, { descriptorPath });
const { listingChecklist, ...rest } = report;
const out = { ...rest, listingChecklistItemCount: report.listingChecklistItems };
process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
process.exit(report.ok ? 0 : 1);
