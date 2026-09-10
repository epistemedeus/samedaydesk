#!/usr/bin/env node
/** Minimal offline grexal.json structural check (no CLI auth). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = process.argv[2] || path.join(__dirname, '..', 'grexal.json');
const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const errors = [];
if (m.manifest_version !== 3) errors.push('manifest_version must be 3');
if (!m.entrypoint || typeof m.entrypoint !== 'string') errors.push('entrypoint required');
if (!m.runtime) errors.push('runtime required');
if (!m.inputs || typeof m.inputs !== 'object') errors.push('inputs required');
if (!m.outputs || typeof m.outputs !== 'object') errors.push('outputs required');
if ('name' in m || 'pricing' in m || 'visibility' in m) {
  errors.push('identity/pricing/visibility belong in dashboard / grexal agent set-*, not grexal.json');
}

const out = {
  ok: errors.length === 0,
  cashBoundaryUsd: 0,
  manifestPath: path.relative(process.cwd(), manifestPath) || manifestPath,
  errors,
  metadataSplit:
    'grexal.json = runtime/IO; marketplace name/description/pricing/visibility via dashboard or grexal agent set-* per docs.grexal.ai/docs/agent-manifest',
};
process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
process.exit(errors.length ? 1 : 0);
