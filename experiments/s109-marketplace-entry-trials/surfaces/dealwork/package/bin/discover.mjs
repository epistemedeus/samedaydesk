#!/usr/bin/env node
/**
 * Public Dealwork job discovery + local bid draft.
 * Never POSTs bids, never onboards, never spends.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(__dirname, '..');
const ROOT = path.resolve(PKG, '../../..');
const DEFAULT_FIXTURE = path.join(ROOT, 'fixtures', 'dealwork-jobs-sample.json');
const API = process.env.DEALWORK_API_BASE || 'https://dealwork.ai/api/v1';

const args = process.argv.slice(2);
const live = args.includes('--live');
const outIdx = args.indexOf('--out');
const outPath = outIdx >= 0 ? args[outIdx + 1] : null;
const query = (() => {
  const i = args.indexOf('--query');
  return i >= 0 ? String(args[i + 1] || '').toLowerCase() : '';
})();

async function loadJobs() {
  if (!live) {
    return JSON.parse(fs.readFileSync(DEFAULT_FIXTURE, 'utf8'));
  }
  const res = await fetch(`${API}/jobs?limit=20`);
  if (!res.ok) throw new Error(`live jobs HTTP ${res.status}`);
  const body = await res.json();
  const jobs = (body.data || body.jobs || []).map((j) => ({
    id: j.id,
    title: j.title,
    description: (j.description || '').slice(0, 500),
    status: j.status,
    budget: j.budget ?? j.budgetMax ?? null,
    currency: j.currency || 'USD',
    createdAt: j.createdAt || j.created_at || null,
  }));
  return { source: `GET ${API}/jobs?limit=20`, jobs };
}

function scoreJob(job) {
  const text = `${job.title || ''}\n${job.description || ''}`.toLowerCase();
  const needles = ['research', 'python', 'script', 'evidence', 'audit', 'data', 'technical', 'source', 'diff', 'report'];
  return needles.reduce((s, n) => s + (text.includes(n) ? 1 : 0), 0);
}

function draftBid(job) {
  return {
    mode: 'local-draft-only',
    willNotPost: true,
    jobId: job.id,
    jobTitle: job.title,
    proposedOffer: {
      title: 'Reproducible source-change evidence pack',
      deliverables: [
        'Pinned git commit range + unified diff',
        'Machine-readable acceptance checklist JSON',
        'Command transcript hashes (no private secrets)',
      ],
      paidDeltaVsFreeDiy:
        'Buyer still can DIY with git+curl; paid delta is packaged acceptance evidence, checklist, and delivery formatting against job criteria.',
      freeAlternative: 'Local git diff + manual README; public x402-data-gateway-skills recipes (MIT/Apache as published).',
      attribution: 'Upstream recipes remain separately licensed; this draft sells packaging/acceptance labor only.',
    },
    openApiNote: 'Submitting requires authenticated POST /jobs/{id}/bids — not performed by this tool.',
  };
}

const payload = await loadJobs();
let jobs = payload.jobs || [];
if (query) jobs = jobs.filter((j) => `${j.title} ${j.description}`.toLowerCase().includes(query));
jobs = [...jobs].sort((a, b) => scoreJob(b) - scoreJob(a));
const result = {
  cashBoundaryUsd: 0,
  live,
  source: payload.source,
  matched: jobs.length,
  top: jobs.slice(0, 5).map((j) => ({ id: j.id, title: j.title, score: scoreJob(j), budget: j.budget })),
  bidDrafts: jobs.slice(0, 3).map(draftBid),
};
const text = `${JSON.stringify(result, null, 2)}\n`;
if (outPath) fs.writeFileSync(outPath, text);
else process.stdout.write(text);
