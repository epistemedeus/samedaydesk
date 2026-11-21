import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const base = new URL(process.argv[2]);
assert.match(base.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
const require = createRequire(join(process.env.SDS_BROWSER_MODULES, 'package.json'));
const { default: puppeteer } = await import(pathToFileURL(require.resolve('puppeteer-core')).href);
const chrome = await puppeteer.launch({
  headless: true, executablePath: '/usr/bin/google-chrome-stable', args: ['--disable-dev-shm-usage'],
});
const cases = ['/', '/for-agents', '/for-agents/record-repeat', '/for-agents/distribution-repair',
  '/for-agents/consumer-repeat', '/for-agents/useful-jobs', '/terms', '/privacy', '/x402',
  '/x402/seller-conformance', '/x402/verified', '/tools/ai-readiness'];
const marker = 'name="sdd-public-first-render"';
try {
  for (const path of cases) {
    const response = await fetch(new URL(path, base), { redirect: 'error' });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes(`${marker} content="${path}"`), path);
    assert.match(html, /<div id="root">[\s\S]*?<main\b[^>]*\bid="main"/);
    assert.match(html, /rel="modulepreload"/);
  }
  for (const [path, status] of [['/login', 200], ['/checkout', 200], ['/care/intake', 200],
    ['/x402/seller-conformance?resolved=preview-only', 200], ['/no-such-public-route', 404]]) {
    const response = await fetch(new URL(path, base), { redirect: 'error' });
    assert.equal(response.status, status, path);
    assert.equal((await response.text()).includes(marker), false, path);
  }
  const browserCases = [...cases.map((path) => [path, 'drafting']), ['/', 'dark'], ['/terms', 'dark']];
  for (const [path, theme] of browserCases) {
    const ctx = await chrome.createBrowserContext();
    try {
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (msg) => {
        if (msg.type() === 'error' && /hydration|minified react|initial page|in html|cannot be (?:a child|a descendant)/i.test(msg.text())) errors.push(msg.text().slice(0, 4200));
      });
      await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      await page.evaluateOnNewDocument((theme) => {
        localStorage.setItem('sdd-theme', theme);
        const watch = new MutationObserver(() => {
          const heading = document.querySelector('#root main h1');
          if (heading) { window.__sddInitialHeading = heading; watch.disconnect(); }
        });
        watch.observe(document, { subtree: true, childList: true });
      }, theme);
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const url = new URL(request.url());
        const own = url.origin === base.origin;
        if (own && url.pathname === '/api/x402-quote') {
          void request.respond({ status: 503, contentType: 'application/json', body: '{}' }).catch(() => {});
          return;
        }
        const read = request.method() === 'GET';
        void (own && read ? request.continue() : request.abort()).catch(() => {});
      });
      assert.equal((await page.goto(new URL(path, base).href)).status(), 200);
      await page.waitForFunction(() => performance.getEntriesByName('sdd:react-ready').length > 0);
      const sameHeading = () => page.evaluate(() => Boolean(window.__sddInitialHeading) && window.__sddInitialHeading === document.querySelector('#root main h1'));
      const trial = `${path} (${theme})`;
      assert.deepEqual(errors, [], trial);
      assert.equal(await sameHeading(), true, `${trial} during hydration`);
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme);
      const direction = theme === 'dark' ? 'Switch to Drafting Table (light) theme' : 'Switch to Engineered Speed (dark) theme';
      const toggle = `button[aria-label="${direction}"]`;
      await page.waitForSelector(toggle, { visible: true });
      await page.click(toggle);
      await page.waitForFunction((initial) => document.documentElement.dataset.theme !== initial, {}, theme);
      assert.deepEqual(errors, [], trial);
      assert.equal(await sameHeading(), true, `${trial} after theme switch`);
    } finally { await ctx.close(); }
  }
  console.log(`SDS_PUBLIC_FIRST_RENDER_OK html=${cases.length} hydration=${browserCases.length} private-shells=5 theme-switch=true`);
} finally { await chrome.close(); }
