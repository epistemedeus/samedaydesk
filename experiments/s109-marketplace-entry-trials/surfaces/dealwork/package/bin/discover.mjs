#!/usr/bin/env node
/**
 * Public Dealwork job discovery + local bid draft.
 * Never POSTs bids, never onboards, never spends.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEALWORK_API_BASE,
  buildDiscoveryResult,
  fetchPublicJobs,
  normalizeJobsPayload,
  parseArgs,
} from '../lib/discover.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(__dirname, '..');
const ROOT = path.resolve(PKG, '../../..');
const DEFAULT_FIXTURE = path.join(ROOT, 'fixtures', 'dealwork-jobs-sample.json');

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  process.stdout.write(`Usage: discover.mjs [--fixture path] [--live] [--query text] [--max-drafts N] [--out path]

GET-only public job discovery. Emits local OpenAPI CreateBid JSON. Does not POST.
Default input: fixtures/dealwork-jobs-sample.json (offline).
`);
  process.exit(0);
}

if (args.forbidden) {
  console.error(
    JSON.stringify({
      ok: false,
      error: 'Refusing --post/--bid/--onboard/--claim. This package is GET + local draft only.',
      cashBoundaryUsd: 0,
    }),
  );
  process.exit(2);
}

async function loadJobs() {
  if (!args.live) {
    const fixturePath = args.fixturePath
      ? path.resolve(args.fixturePath)
      : DEFAULT_FIXTURE;
    const payload = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    return {
      source: payload.source || `fixture:${fixturePath}`,
      jobs: normalizeJobsPayload(payload),
      meta: payload.meta || null,
    };
  }
  const base = process.env.DEALWORK_API_BASE || DEALWORK_API_BASE;
  return fetchPublicJobs({ base, perPage: 50, maxPages: 2 });
}

const payload = await loadJobs();
const result = buildDiscoveryResult({
  jobs: payload.jobs,
  source: payload.source,
  live: args.live,
  query: args.query,
  maxDrafts: Number.isFinite(args.maxDrafts) && args.maxDrafts > 0 ? args.maxDrafts : 3,
  meta: payload.meta,
});

const text = `${JSON.stringify(result, null, 2)}\n`;
if (args.outPath) {
  fs.mkdirSync(path.dirname(path.resolve(args.outPath)), { recursive: true });
  fs.writeFileSync(args.outPath, text);
} else {
  process.stdout.write(text);
}
