/**
 * Public Dealwork job discovery + local OpenAPI CreateBid drafts.
 * GET /api/v1/jobs only. Never POSTs onboard/bid/claim/deliver.
 */

export const DEALWORK_API_BASE = 'https://dealwork.ai/api/v1';
export const CREATE_BID_PATH = '/api/v1/jobs/{id}/bids';
export const OPENAPI_CREATE_BID_KEYS = Object.freeze(['jobId', 'amount', 'message']);
export const SKILL_BID_KEYS = Object.freeze(['proposedAmount', 'estimatedHours', 'proposalText']);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Tokens that mark a title as executable by an agent (not a human-only errand). */
export const MACHINE_TITLE_TOKENS = Object.freeze([
  'research',
  'python',
  'script',
  'scripts',
  'data',
  'technical',
  'code',
  'coding',
  'audit',
  'json',
  'csv',
  'api',
  'report',
  'reports',
  'analysis',
  'docs',
  'documentation',
  'scrape',
  'scraping',
  'automation',
  'pytest',
  'seo',
  'review',
  'typescript',
  'javascript',
  'parser',
  'excel',
  'pipeline',
  'openapi',
  'writing',
  'translation',
  'bug fix',
  'bugfix',
  'brief',
  'briefs',
  'intelligence',
  'write',
]);

export function normalizeJobsPayload(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.jobs)) return payload.jobs;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

export function isMachineFriendlyTitle(title) {
  const t = String(title || '').trim();
  if (t.length < 12) return false;
  if (/^test(\s+\d+)?$/i.test(t)) return false;
  if (/^place a bid/i.test(t)) return false;
  const lower = t.toLowerCase();
  const hits = MACHINE_TITLE_TOKENS.filter((n) => lower.includes(n)).length;
  return hits >= 1;
}

export function titleScore(title) {
  const lower = String(title || '').toLowerCase();
  return MACHINE_TITLE_TOKENS.reduce((s, n) => s + (lower.includes(n) ? 1 : 0), 0);
}

export function parseMoney(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function budgetWindow(job) {
  const min = parseMoney(job?.budgetMin) ?? 0;
  const max = parseMoney(job?.budgetMax ?? job?.budget ?? job?.fixedPrice);
  return { min, max };
}

/** Prefer $15 SDS bundle (D1) when it sits inside budgetMin–budgetMax. */
export function pickBidAmount(job, preferred = 15) {
  const { min, max } = budgetWindow(job);
  if (max == null || max <= 0) {
    return { amount: null, min, max, reason: 'budget-max-not-positive' };
  }
  let amount = preferred;
  if (amount < min) amount = min;
  if (amount > max) amount = max;
  if (!(amount > 0)) {
    return { amount: null, min, max, reason: 'no-positive-amount-in-range' };
  }
  return { amount: Number(amount.toFixed(2)), min, max, reason: null };
}

export function validateCreateBid(body) {
  const errors = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, errors: ['CreateBid must be an object'] };
  }
  if (typeof body.jobId !== 'string' || !UUID_RE.test(body.jobId)) {
    errors.push('jobId must be a uuid string (OpenAPI CreateBid.jobId)');
  }
  if (typeof body.amount !== 'number' || !Number.isFinite(body.amount) || !(body.amount > 0)) {
    errors.push('amount must be a positive number (OpenAPI CreateBid.amount)');
  }
  if (body.message !== undefined && typeof body.message !== 'string') {
    errors.push('message must be a string when present (OpenAPI CreateBid.message)');
  }
  const extraKeys = Object.keys(body).filter((k) => !OPENAPI_CREATE_BID_KEYS.includes(k));
  if (extraKeys.length) {
    errors.push(`CreateBid extra keys not in OpenAPI schema: ${extraKeys.join(',')}`);
  }
  return { ok: errors.length === 0, errors, extraKeys };
}

function snippet(text, n = 140) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  return `${s.slice(0, n - 1)}…`;
}

export function proposalForJob(job, { amount, estimatedHours }) {
  const title = job.title || job.id;
  const mode = job.jobMode || 'unknown';
  const descBit = snippet(job.description, 120);
  const criteria = Array.isArray(job.acceptanceCriteria)
    ? job.acceptanceCriteria
        .slice(0, 3)
        .map((c) => c.id || c.title || c)
        .join(', ')
    : '';
  const criteriaLine = criteria
    ? ` I would address acceptanceCriteria ${criteria} in the pack.`
    : '';
  return (
    `SameDayDesk local draft for “${title}” (${mode}-mode). ` +
    `I would deliver a reproducible source-change evidence pack: pinned git range + unified diff, ` +
    `acceptance.json pass/fail checklist, and command-transcript hashes (no secrets). ` +
    `Job brief excerpt: ${descBit || '(no description)'}.` +
    criteriaLine +
    ` Evidence routes: GET|POST /work/opportunity-preflight, GET /scan, GET /distribution/agent-discoverability-audit. ` +
    `Public x402-data-gateway-skills@82d0f019713c7223898806144da08fdbeed5c666 stay free; ` +
    `this amount would buy packaging/acceptance labor only, not recipe relicensing. ` +
    `Estimate ${estimatedHours}h at $${Number(amount).toFixed(2)}. ` +
    `This object is a local OpenAPI CreateBid body; POST ${CREATE_BID_PATH} is not performed.`
  );
}

export function postBlockersFor(job, amountPick) {
  const blockers = ['cash-boundary-usd-0', 'worker-must-not-post'];
  if (job.posterFunded !== true) blockers.push('poster-not-funded');
  if (job.jobMode === 'open' && job.claimable !== true) blockers.push('open-mode-not-claimable');
  if (job.posterType === 'ai_agent') blockers.push('likely-seller-ad-not-buyer-rfq');
  if (amountPick.amount == null) blockers.push(amountPick.reason || 'invalid-amount');
  if (parseMoney(job.budgetMax ?? job.budget) === 0) blockers.push('budget-max-zero');
  return blockers;
}

export function draftBid(job, { preferredAmount = 15, estimatedHours = 1.5 } = {}) {
  const amountPick = pickBidAmount(job, preferredAmount);
  const hours = estimatedHours;
  const amount = amountPick.amount;
  const message =
    amount == null
      ? `Cannot form a positive CreateBid.amount for “${job.title}” (budget window ${amountPick.min}–${amountPick.max}). Local draft only; not posted.`
      : proposalForJob(job, { amount, estimatedHours: hours });

  const createBid =
    amount == null
      ? null
      : {
          jobId: job.id,
          amount,
          message,
        };

  const proposedAmount = amount == null ? null : amount.toFixed(2);
  const localDualAliasDraft =
    amount == null
      ? null
      : {
          jobId: job.id,
          amount,
          proposedAmount,
          estimatedHours: hours,
          message,
          proposalText: message,
        };

  const schemaCheck = createBid ? validateCreateBid(createBid) : { ok: false, errors: ['no CreateBid: amount not positive'] };

  return {
    willNotPost: true,
    endpoint: `POST ${CREATE_BID_PATH.replace('{id}', job.id)}`,
    performed: false,
    schema: 'OpenAPI CreateBid (jobId, amount, message) + skill.md dual aliases',
    job: {
      id: job.id,
      title: job.title,
      status: job.status ?? null,
      jobMode: job.jobMode ?? null,
      budgetMin: job.budgetMin ?? null,
      budgetMax: job.budgetMax ?? job.budget ?? null,
      posterFunded: job.posterFunded ?? null,
      claimable: job.claimable ?? null,
      posterType: job.posterType ?? null,
      titleScore: titleScore(job.title),
    },
    createBid,
    skillAliases:
      amount == null
        ? null
        : {
            proposedAmount,
            estimatedHours: hours,
            proposalText: message,
          },
    localDualAliasDraft,
    openApiValidation: schemaCheck,
    paidDeltaVsFreeDiy:
      'Buyer can DIY with git+curl; paid delta is packaged acceptance evidence, checklist, and delivery formatting against job criteria.',
    freeAlternative:
      'Local git diff + manual README; public x402-data-gateway-skills recipes (as published upstream).',
    postBlockers: postBlockersFor(job, amountPick),
  };
}

export function filterAndRankJobs(jobs, { query = '' } = {}) {
  const q = String(query || '').trim().toLowerCase();
  const dropped = [];
  const matched = [];
  for (const job of jobs) {
    if (q && !`${job.title || ''} ${job.description || ''}`.toLowerCase().includes(q)) {
      dropped.push({ id: job.id, title: job.title, reason: 'query-miss' });
      continue;
    }
    if (!isMachineFriendlyTitle(job.title)) {
      dropped.push({ id: job.id, title: job.title, reason: 'not-machine-friendly-title' });
      continue;
    }
    matched.push(job);
  }
  matched.sort((a, b) => titleScore(b.title) - titleScore(a.title));
  return { matched, dropped };
}

export async function fetchPublicJobs({
  base = DEALWORK_API_BASE,
  perPage = 50,
  maxPages = 2,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is not available');
  }
  const jobs = [];
  let meta = null;
  const pages = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const url = `${base.replace(/\/$/, '')}/jobs?per_page=${perPage}&page=${page}`;
    const res = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json', 'User-Agent': 's109-dealwork-discover/0.1 (GET-only; no bid)' },
    });
    if (!res.ok) {
      throw new Error(`GET ${url} HTTP ${res.status}`);
    }
    const body = await res.json();
    meta = body.meta || meta;
    const pageJobs = normalizeJobsPayload(body);
    pages.push({ url, count: pageJobs.length, status: res.status });
    jobs.push(...pageJobs);
    if (pageJobs.length < perPage) break;
    if (meta && typeof meta.total === 'number' && page * perPage >= meta.total) break;
  }
  return {
    source: `GET ${base.replace(/\/$/, '')}/jobs?per_page=${perPage}`,
    jobs,
    meta,
    pages,
    method: 'GET',
  };
}

export function buildDiscoveryResult({
  jobs,
  source,
  live,
  query = '',
  maxDrafts = 3,
  meta = null,
} = {}) {
  const listed = jobs.length;
  const { matched, dropped } = filterAndRankJobs(jobs, { query });
  const draftJobs = matched.slice(0, maxDrafts);
  const bidDrafts = draftJobs.map((job) => draftBid(job));

  return {
    ok: true,
    cashBoundaryUsd: 0,
    live: Boolean(live),
    posted: false,
    onboarded: false,
    mutatingCallsMade: false,
    source,
    listed,
    machineFriendly: matched.length,
    dropped,
    query: query || null,
    meta,
    top: matched.slice(0, 5).map((j) => ({
      id: j.id,
      title: j.title,
      score: titleScore(j.title),
      jobMode: j.jobMode ?? null,
      budgetMax: j.budgetMax ?? j.budget ?? null,
    })),
    bidDrafts,
    openApiNote:
      'Submitting requires authenticated POST /jobs/{id}/bids with OpenAPI CreateBid {jobId, amount, message}. This tool never sends that request. skill.md names the same payload proposedAmount / estimatedHours / proposalText — both are emitted as local dual aliases.',
  };
}

export function parseArgs(argv) {
  const args = [...argv];
  const has = (flag) => args.includes(flag);
  const val = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? String(args[i + 1] || '') : null;
  };
  return {
    live: has('--live'),
    outPath: val('--out'),
    query: (val('--query') || '').toLowerCase(),
    fixturePath: val('--fixture'),
    maxDrafts: Number(val('--max-drafts') || 3),
    help: has('--help') || has('-h'),
    forbidden: args.some((a) => ['--post', '--bid', '--onboard', '--claim'].includes(a)),
  };
}
