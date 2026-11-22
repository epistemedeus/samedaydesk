import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
const out = process.argv[2], base = process.argv[3];
if (!out?.startsWith('/') || !/^http:\/\/127\.0\.0\.1:\d+$/.test(base || '')) throw Error('Owned evidence directory and local private preview are required.');
const kit = process.env.RELEASE_KIT_DIR;
const { default: puppeteer } = await import(createRequire(join(kit, 'package.json')).resolve('puppeteer-core'));
const { inspect } = await import(pathToFileURL(join(kit, 'visual-inspect.mjs')).href);
await mkdir(out, { recursive: true, mode: 0o700 });
const source = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const browser = await puppeteer.launch({ executablePath: process.env.RELEASE_CHROME, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const result = { source, target: 'https://samedaydesk.com/', actualPreviewApi: true, views: [], interactions: [], errors: [] };
try {
  for (const route of ['/', '/tools/ai-readiness']) {
    const context = await browser.createBrowserContext(), page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewport({ width: 1512, height: 1000 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.goto(base + route, { waitUntil: 'networkidle0', timeout: 20_000 });
    const input = route === '/' ? '#hero-check-url' : 'input[aria-label="Website URL"]';
    await page.waitForSelector(input); await page.type(input, result.target);
    const began = Date.now();
    await page.$eval(input, (element) => element.form.requestSubmit());
    await page.waitForFunction(() => document.querySelector('[data-free-check-report]') || document.querySelector('[role="alert"]'), { timeout: 23_000 });
    const alert = await page.$eval('[role="alert"]', (element) => element.textContent).catch(() => null);
    if (alert) { result.errors.push({ route, alert }); await context.close(); continue; }
    const elapsedMs = Date.now() - began;
    const href = await page.$eval('[data-free-check-report] a[href*="?report="]', (element) => element.getAttribute('href'));
    const report = await page.evaluate(async (href) => {
      const id = new URL(href, location.origin).searchParams.get('report');
      const response = await fetch('/api/tools/ai-readiness?version=2&report=' + id); return { status: response.status, body: await response.json() };
    }, href);
    result.interactions.push({ route, elapsedMs, within20Seconds: elapsedMs <= 20_000, permalink: href, storedStatus: report.status, score: report.body.score, checkCount: report.body.checks?.length });
    await writeFile(join(out, `actual-report-${route === '/' ? 'home' : 'tool'}.json`), JSON.stringify(report, null, 2), { mode: 0o600 });
    for (const width of [375, 768, 1280, 1512, 1920, 2560]) for (const theme of ['drafting', 'dark']) {
      await page.setViewport({ width, height: 1000 });
      await page.evaluate((theme) => { localStorage.setItem('sdd-theme', theme); document.documentElement.setAttribute('data-theme', theme); }, theme);
      await new Promise((resolve) => setTimeout(resolve, 150));
      const g1Findings = await page.evaluate(inspect, { minGap: 16, maxFindings: 40 });
      const state = await page.evaluate(() => ({ overflowPx: Math.max(0, document.documentElement.scrollWidth - innerWidth), text: document.querySelector('[data-free-check-report]')?.innerText.slice(0, 1000) }));
      const file = `${route === '/' ? 'home' : 'tool'}-${width}-${theme}.jpg`;
      await page.screenshot({ path: join(out, file), fullPage: true, type: 'jpeg', quality: 80 });
      result.views.push({ route, width, theme, file, ...state, g1Findings, errors });
    }
    await page.goto(base + href, { waitUntil: 'networkidle0', timeout: 20_000 });
    await page.waitForSelector('[data-free-check-report]', { timeout: 5000 });
    result.interactions.at(-1).permalinkUiReloadPassed = true;
    await context.close();
  }
} catch (error) { result.errors.push(error.message); }
finally { await browser.close(); await writeFile(join(out, 'report.json'), JSON.stringify(result, null, 2) + '\n', { mode: 0o600 }); }
console.log(JSON.stringify({ source, views: result.views.length, interactions: result.interactions.length, errors: result.errors.length }));
if (result.errors.length || result.views.some((view) => view.overflowPx || view.errors.length || view.g1Findings.length) || result.interactions.length !== 2 || result.interactions.some((item) => !item.within20Seconds || item.storedStatus !== 200 || item.checkCount !== 40 || !item.permalinkUiReloadPassed)) process.exitCode = 1;
