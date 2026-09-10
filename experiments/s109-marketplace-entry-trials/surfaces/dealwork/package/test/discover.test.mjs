import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isMachineFriendlyTitle,
  validateCreateBid,
  draftBid,
  filterAndRankJobs,
  normalizeJobsPayload,
  OPENAPI_CREATE_BID_KEYS,
  SKILL_BID_KEYS,
} from '../lib/discover.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(__dirname, '..');
const bin = path.join(pkg, 'bin', 'discover.mjs');
const lib = path.join(pkg, 'lib', 'discover.mjs');
const fixture = path.resolve(pkg, '../../../fixtures/dealwork-jobs-sample.json');

function runCli(extra = []) {
  return spawnSync(process.execPath, [bin, '--fixture', fixture, ...extra], {
    encoding: 'utf8',
  });
}

test('fixture exists and is a jobs sample', () => {
  const payload = JSON.parse(fs.readFileSync(fixture, 'utf8'));
  const jobs = normalizeJobsPayload(payload);
  assert.ok(jobs.length >= 3, 'sample needs several jobs');
  assert.ok(jobs.some((j) => /test\s*7/i.test(j.title)), 'sample should include Test 7 as a negative title');
  assert.ok(
    jobs.some((j) => isMachineFriendlyTitle(j.title)),
    'sample should include at least one machine-friendly title',
  );
});

test('machine-friendly title filter keeps skill titles and drops Test 7', () => {
  assert.equal(isMachineFriendlyTitle('Test 7'), false);
  assert.equal(isMachineFriendlyTitle('test'), false);
  assert.equal(isMachineFriendlyTitle('$5 中文内容快速交付：公众号文案/小红书种草/去AI味改写'), false);
  assert.equal(
    isMachineFriendlyTitle('🔍 Enterprise Sales Intelligence & Customer Research Briefs'),
    true,
  );
  assert.equal(
    isMachineFriendlyTitle(
      'cursor-runner-b872 — sourced research, Python/TS scripts, docs, data cleanup ($15–$80)',
    ),
    true,
  );
  const payload = JSON.parse(fs.readFileSync(fixture, 'utf8'));
  const { matched, dropped } = filterAndRankJobs(normalizeJobsPayload(payload));
  assert.ok(matched.length >= 1);
  assert.ok(dropped.some((d) => d.reason === 'not-machine-friendly-title' && /test\s*7/i.test(d.title)));
  assert.ok(!matched.some((j) => /test\s*7/i.test(j.title)));
});

test('CreateBid validator matches OpenAPI required fields', () => {
  const ok = validateCreateBid({
    jobId: 'caee182a-1c88-4080-9514-a0823a9eed55',
    amount: 15,
    message: 'job-specific proposal',
  });
  assert.equal(ok.ok, true);
  const missing = validateCreateBid({ amount: 15 });
  assert.equal(missing.ok, false);
  const extra = validateCreateBid({
    jobId: 'caee182a-1c88-4080-9514-a0823a9eed55',
    amount: 15,
    message: 'x',
    proposedAmount: '15.00',
  });
  assert.equal(extra.ok, false);
});

test('draftBid emits OpenAPI body plus skill dual aliases and never marks posted', () => {
  const job = {
    id: 'caee182a-1c88-4080-9514-a0823a9eed55',
    title: 'cursor-runner-b872 — sourced research, Python/TS scripts, docs, data cleanup ($15–$80)',
    description: 'Sourced research memos and Python/TypeScript scripts.',
    jobMode: 'bid',
    budgetMin: '15.0000',
    budgetMax: '80.0000',
    posterFunded: false,
    posterType: 'ai_agent',
  };
  const d = draftBid(job);
  assert.equal(d.willNotPost, true);
  assert.equal(d.performed, false);
  assert.deepEqual(Object.keys(d.createBid).sort(), [...OPENAPI_CREATE_BID_KEYS].sort());
  assert.equal(validateCreateBid(d.createBid).ok, true);
  assert.equal(d.createBid.jobId, job.id);
  assert.equal(d.createBid.amount, 15);
  assert.match(d.createBid.message, /cursor-runner-b872/i);
  assert.match(d.createBid.message, /not performed/i);
  for (const k of SKILL_BID_KEYS) assert.ok(k in d.skillAliases);
  assert.equal(d.localDualAliasDraft.proposedAmount, '15.00');
  assert.equal(d.localDualAliasDraft.proposalText, d.createBid.message);
  assert.ok(d.postBlockers.includes('worker-must-not-post'));
  assert.ok(d.postBlockers.includes('poster-not-funded'));
});

test('fixture discovery CLI emits local bid drafts without posting', () => {
  const r = runCli();
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.cashBoundaryUsd, 0);
  assert.equal(j.live, false);
  assert.equal(j.posted, false);
  assert.equal(j.mutatingCallsMade, false);
  assert.ok(j.machineFriendly >= 1);
  assert.ok(j.bidDrafts.length >= 1);
  assert.equal(j.bidDrafts[0].willNotPost, true);
  assert.match(j.bidDrafts[0].paidDeltaVsFreeDiy, /packaged acceptance/i);
  for (const draft of j.bidDrafts) {
    assert.equal(draft.performed, false);
    assert.equal(validateCreateBid(draft.createBid).ok, true, draft.openApiValidation?.errors?.join(';'));
    assert.equal(draft.createBid.jobId, draft.job.id);
    assert.match(draft.createBid.message, new RegExp(draft.job.title.slice(0, 24).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.ok(j.dropped.some((d) => d.reason === 'not-machine-friendly-title'));
});

test('CLI refuses mutating flags', () => {
  const r = runCli(['--post']);
  assert.equal(r.status, 2);
  const j = JSON.parse(r.stderr);
  assert.equal(j.ok, false);
});

test('package source never POSTs bids or onboard', () => {
  const src = `${fs.readFileSync(bin, 'utf8')}\n${fs.readFileSync(lib, 'utf8')}`;
  assert.equal(/method:\s*['"]POST['"]/.test(src), false);
  assert.equal(/fetch\([^)]*bids/.test(src), false);
  assert.match(src, /method:\s*['"]GET['"]/);
  assert.match(src, /Never POSTs|never sends that request|willNotPost/i);
});
