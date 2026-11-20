import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const { AUDIT_MODULES, AUDIT_PREVIEW_URL, AUDIT_LIVE_ORIGIN, AUDIT_OUTPUT, AUDIT_CHROME, GITHUB_SHA } = process.env;
const shard = Number(process.env.AUDIT_SHARD ?? 0);
const shards = Number(process.env.AUDIT_SHARDS ?? 1);
assert.ok([AUDIT_MODULES, AUDIT_PREVIEW_URL, AUDIT_LIVE_ORIGIN, AUDIT_OUTPUT, AUDIT_CHROME].every(Boolean));
assert.ok(Number.isInteger(shard) && Number.isInteger(shards) && shard >= 0 && shard < shards);
const preview = new URL(AUDIT_PREVIEW_URL);
const live = new URL(AUDIT_LIVE_ORIGIN);
assert.match(preview.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
assert.ok(['https://neomorphic.io', 'https://samedaydesk.com', 'https://ein.llc'].includes(live.origin));
const require = createRequire(join(AUDIT_MODULES, 'package.json'));
const { default: lighthouse } = await import(pathToFileURL(require.resolve('lighthouse')).href);
const { default: puppeteer } = await import(pathToFileURL(require.resolve('puppeteer-core')).href);
const limits = { lcpMs: 2500, cls: 0.1, tbtMs: 200 };
const reportFor = (name) => join(AUDIT_OUTPUT, name);
await mkdir(AUDIT_OUTPUT, { recursive: true });

const sitemap = await fetch(new URL('/sitemap.xml', preview), { redirect: 'error', signal: AbortSignal.timeout(10_000) });
assert.equal(sitemap.status, 200);
const entries = [...new Set([...((await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g))]
  .map(([, value]) => {
    const entry = new URL(value);
    assert.equal(entry.origin, live.origin);
    assert.ok(!entry.search && !entry.hash && !entry.pathname.startsWith('/dev/'));
    return entry.pathname;
  }))].sort();
assert.ok(entries.length > 1 && entries[0] === '/', 'The homepage and sitemap inventory are required');
const assigned = entries.filter((_, i) => i % shards === shard);
// A sitemap can also enumerate machine documents. They still need a working
// route, but Lighthouse's visual budget does not apply to a text file.
const nonHtml = [];
const paths = [];
for (const path of assigned) {
  const check = await fetch(new URL(path, preview), {
    method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(8_000),
  });
  const contentType = check.headers.get('content-type') ?? '';
  const machineDocument = /\.(?:txt|md|json|xml)$/.test(path);
  if (machineDocument && check.status === 200 && contentType && !contentType.includes('text/html')) {
    nonHtml.push({ path, contentType });
    console.log('MOBILE_NON_HTML', JSON.stringify(nonHtml.at(-1)));
  } else {
    paths.push(path);
  }
}
assert.ok(paths.length > 0);
const browser = await puppeteer.launch({
  executablePath: AUDIT_CHROME,
  headless: true,
  args: ['--disable-dev-shm-usage'],
});
const version = await browser.version();
const results = [];
const median = (xs) => xs.length ? xs.toSorted((a, b) => a - b)[Math.floor(xs.length / 2)] : null;
const onBudget = (row) => Object.entries(limits).every(([k, value]) => Number.isFinite(row[k]) && row[k] <= value);

async function measure(origin, path, sample, kind) {
  const ctx = await browser.createBrowserContext();
  const blocked = new Set();
  let documentStatus = null;
  let finalUrl = null;
  let receipt = null;
  let reportError = null;
  let slowPage = null;
  const target = new URL(path, origin).href;
  const reportName = `${kind}-${createHash('sha256').update(path).digest('hex').slice(0, 10)}-${sample}.json`;
  try {
    const page = await ctx.newPage();
    await page.setBypassServiceWorker(true);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      let requestOrigin;
      try { requestOrigin = new URL(request.url()).origin; } catch { requestOrigin = 'invalid'; }
      const method = request.method();
      if (requestOrigin === origin.origin && (method === 'GET' || method === 'HEAD')) {
        void request.continue().catch(() => {});
      } else {
        blocked.add(`${method} ${requestOrigin}`);
        void request.abort().catch(() => {});
      }
    });
    page.on('response', (response) => {
      const request = response.request();
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentStatus = response.status();
    });
    const result = await lighthouse(target, {
      output: 'json',
      logLevel: 'error',
      formFactor: 'mobile',
      throttlingMethod: 'simulate',
      onlyCategories: ['performance'],
      maxWaitForLoad: 25_000,
    }, undefined, page);
    if (result?.lhr) {
      const lhr = result.lhr;
      finalUrl = lhr.finalDisplayedUrl;
      reportError = lhr.runtimeError?.code ?? null;
      await writeFile(reportFor(reportName), result.report + '\n');
      receipt = {
        lcpMs: lhr.audits['largest-contentful-paint']?.numericValue ?? null,
        cls: lhr.audits['cumulative-layout-shift']?.numericValue ?? null,
        tbtMs: lhr.audits['total-blocking-time']?.numericValue ?? null,
        navigation: lhr.configSettings.throttlingMethod,
      };
      if (!onBudget(receipt)) {
        const details = lhr.audits['lcp-breakdown-insight']?.details?.items ?? [];
        const timings = details.find((item) => item.type === 'table')?.items ?? [];
        const blockers = lhr.audits['render-blocking-insight']?.details?.items ?? [];
        const tasks = lhr.audits['long-tasks']?.details?.items ?? [];
        const safePath = (value) => {
          try {
            const url = new URL(value);
            return url.origin === origin.origin ? url.pathname : '(other origin)';
          } catch { return '(unattributed)'; }
        };
        slowPage = {
          timingMs: Object.fromEntries(timings.map(({ subpart, duration }) => [subpart, Math.round(duration)])),
          blockers: blockers.slice(0, 5).map(({ url, totalBytes, wastedMs }) => [safePath(url), totalBytes, wastedMs]),
          tasks: tasks.slice(0, 5).map(({ url, duration }) => [safePath(url), Math.round(duration)]),
        };
      }
    } else {
      reportError = 'lighthouse_missing_report';
    }
  } catch (error) {
    reportError = String(error.message).split('\n')[0].slice(0, 150);
  } finally {
    await ctx.close();
  }
  const result = {
    path, sample, kind, status: documentStatus, finalUrl, reportError, ...receipt,
    blocked: [...blocked], file: receipt ? reportName : null,
  };
  result.measured = result.status === 200 && finalUrl === target && !reportError && result.navigation === 'simulate' &&
    Object.keys(limits).every((key) => Number.isFinite(result[key]));
  result.withinLimits = result.measured && onBudget(result);
  results.push(result);
  console.log('MOBILE_AUDIT', JSON.stringify({
    path, sample, kind, status: documentStatus, lcpMs: result.lcpMs, cls: result.cls, tbtMs: result.tbtMs,
    pass: result.withinLimits, error: reportError,
  }));
  if (slowPage && documentStatus === 200) console.log('MOBILE_CAUSAL_TIMING', JSON.stringify({ path, sample, kind, ...slowPage }));
  return result;
}

let compare = null;
try {
  for (const path of paths) {
    if (path !== '/') {
      await measure(preview, path, 1, 'preview');
      continue;
    }
    const local = [], hosted = [];
    let liveCheck = true;
    // Interleave exact settings on the same runner. Never reissue a refused
    // live request just to fill the sample count.
    for (let i = 1; i <= 3; i++) {
      local.push(await measure(preview, '/', i, 'preview'));
      if (liveCheck) {
        const observation = await measure(live, '/', i, 'live');
        hosted.push(observation);
        liveCheck = observation.measured;
      }
    }
    const previewLcpMs = local.every((r) => r.measured) ? median(local.map((r) => r.lcpMs)) : null;
    const liveLcpMs = hosted.length === 3 && hosted.every((r) => r.measured) ? median(hosted.map((r) => r.lcpMs)) : null;
    const ratio = previewLcpMs !== null && liveLcpMs !== null && liveLcpMs > 0 ? previewLcpMs / liveLcpMs : null;
    compare = { previewLcpMs, liveLcpMs, ratio, pass: ratio !== null && ratio <= 1.10, liveSamples: hosted.length };
  }
} finally {
  await browser.close();
}
const failures = results.filter((r) => r.kind === 'preview' && !r.withinLimits);
await writeFile(reportFor('summary.json'), JSON.stringify({
  source: GITHUB_SHA ?? null, version, formFactor: 'mobile', throttling: 'simulate', limits,
  scope: 'Public sitemap; browser traffic is limited to same-origin GET/HEAD. Authenticated states are not covered.',
  shard, shards, totalSitemapEntries: entries.length, pagesAudited: paths.length, nonHtml,
  failures: failures.length, compare, results,
}, null, 2) + '\n');
console.log('MOBILE_AUDIT_SUMMARY', JSON.stringify({ pagesAudited: paths.length, failures: failures.length, compare }));
if (failures.length || (compare && !compare.pass)) process.exitCode = 1;
