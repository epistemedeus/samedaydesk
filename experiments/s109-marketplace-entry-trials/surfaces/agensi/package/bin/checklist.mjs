#!/usr/bin/env node
/**
 * Offline Agensi listing checklist.
 * Validates the sanitized offer descriptor JSON Schema, then prints
 * checklist item status. Does not hit Cloudflare Access, list, or spend.
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
  process.stdout.write(`Usage: checklist.mjs [descriptor.json]

Offline listing checklist + descriptor schema validation.
Does not authenticate, list, or spend.
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
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(report.ok ? 0 : 1);
