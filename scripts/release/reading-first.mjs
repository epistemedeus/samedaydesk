// Rendered G2 regression and operator-preview capture. No Lighthouse or provider calls.
// RELEASE_KIT_DIR points to the already installed shared kit; SDS_READING_OUT is private.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { serve } from '../performance/preview-server.mjs';
import { publicPages } from '../../client/src/public-pages.ts';

const root = resolve(new URL('../..', import.meta.url).pathname);
const out = process.env.SDS_READING_OUT;
assert.ok(out?.startsWith('/'), 'SDS_READING_OUT must be an absolute private output directory');
const kit = process.env.RELEASE_KIT_DIR;
assert.ok(kit?.startsWith('/'), 'RELEASE_KIT_DIR must name the installed kit');
const { default: puppeteer } = await import(createRequire(join(kit, 'package.json')).resolve('puppeteer-core'));
mkdirSync(out, { recursive: true, mode: 0o700 });
const source = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const pages = JSON.parse(readFileSync(join(root, 'release/key-pages.json'), 'utf8')).pages;
for (const item of publicPages) if (!pages.some(p => p.path === item.path)) pages.push({ name:item.path.slice(1).replaceAll('/', '-'), path:item.path });
pages.push({ name:'care-buy-bank-preview', path:'/care/buy?offer=keep_it_working', bank:true });
const only = process.env.SDS_READING_ONLY?.split(',');
if (only) assert.ok(new Set(only).size === only.length && only.every(name => pages.some(p => p.name === name)), 'unknown or duplicate capture selection');
const closure = () => Object.fromEntries(readdirSync(join(root, 'client/dist'), { recursive:true, withFileTypes:true })
  .filter(e => e.isFile()).map(e => {
    const file=join(e.parentPath,e.name);
    return [file.slice(join(root, 'client/dist').length+1), createHash('sha256').update(readFileSync(file)).digest('hex')];
  }).sort(([a],[b]) => a.localeCompare(b)));
const emitted = closure();
const server = serve(join(root, 'client/dist'));
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: process.env.RELEASE_CHROME || '/usr/bin/google-chrome', headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const report = { source, dirtyAtStart:execFileSync('git', ['status','--porcelain','--untracked-files=no'], { cwd:root, encoding:'utf8' }).trim() !== '',
  scope: 'G2 rendered regression and screenshots; not G1, a provider payment or Lighthouse', emitted, views: [], actions: [], errors: [] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function open(path, width, theme, reduce = 'reduce', bank = false) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewport({ width, height: 900 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: reduce }]);
  await page.evaluateOnNewDocument(t => localStorage.setItem('sdd-theme', t), theme);
  // Only the read-only methods response is a fixture, to capture the off/bank-on presentation.
  await page.setRequestInterception(true);
  page.on('request', request => request.url() === origin + '/api/care/methods'
    ? request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ methods: bank ? ['card', 'bank_transfer'] : ['card'] }) })
    : request.continue());
  await page.goto(origin + path, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  assert.deepEqual(errors, [], path);
  return { context, page, errors };
}
try {
  const { context, page } = await open('/', 1280, 'drafting', 'no-preference');
  await page.waitForSelector('[data-drafting-rulers]');
  const reticle = '[class*="draftMark"]';
  const before = await page.$eval(reticle, e => { const r=e.getBoundingClientRect(); return [r.x,r.y,r.width,r.height]; });
  await page.mouse.move(550, 300);
  await sleep(180);
  assert.deepEqual(await page.$eval(reticle, e => { const r=e.getBoundingClientRect(); return [r.x,r.y,r.width,r.height]; }), before);
  await page.evaluate(() => document.querySelector('#services').scrollIntoView());
  await page.mouse.move(600, 400);
  await sleep(200);
  assert.equal(await page.$$eval('[data-h], [data-v], [data-read]', items => items.length), 0);
  const ticks = await page.$$eval('[data-tick-x], [data-tick-y]', items => items.map(e => {
    const r=e.getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height };
  }));
  assert.equal(ticks.length, 2);
  assert.ok(ticks.every(r => r.width <= 10 && r.height <= 10 && (r.x === 0 || r.y === 0)));
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.waitForFunction(() => !document.querySelector('[data-drafting-rulers]') && !window.__lenis);
  const still = await page.$eval(reticle, e => getComputedStyle(e).transform);
  assert.equal(still, 'none');
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await page.waitForSelector('[data-drafting-rulers]');
  report.actions.push({ stationaryHeroReticle: true, onlyEdgeTicks: ticks, dynamicReducedMotionStopsRulersAndSmoothScroll: true,
    motionCanResume: true, noCoordinateReadoutOrFullPageLines: true });
  await context.close();
  for (const item of pages.filter(p => !only || only.includes(p.name))) {
    for (const width of [375, 768, 1280, 1512, 1920, 2560]) for (const theme of ['drafting', 'dark']) {
      const { context, page, errors } = await open(item.path, width, theme, 'reduce', item.bank);
      if (item.bank) {
        assert.ok(await page.$('input[type="email"]'));
        assert.match(await page.$eval('main', e => e.innerText), /Pay by bank transfer/);
        assert.doesNotMatch(await page.$eval('main', e => e.innerText), /USDC/);
      }
      assert.equal(await page.$$eval('[data-drafting-rulers]', items => items.length), 0);
      const filename = `${item.name}-${width}-${theme}.jpg`;
      await page.screenshot({ path: join(out, filename), fullPage: true, type: 'jpeg', quality: 80 });
      const state = await page.evaluate(() => ({ url: location.pathname + location.search, title: document.title,
        heading: document.querySelector('main h1')?.textContent, horizontalOverflow: Math.max(0, document.documentElement.scrollWidth-innerWidth) }));
      report.views.push({ name:item.name, path:item.path, width, theme, screenshot:filename, bankMethodsResponseFixture:!!item.bank, ...state, errors });
      await context.close();
    }
  }
  assert.deepEqual(closure(), emitted, 'production bytes changed during capture');
} catch (e) { report.errors.push(e.stack); throw e; }
finally {
  await browser.close();
  await new Promise(r => server.close(r));
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2)+'\n', { mode:0o600 });
}
console.log(JSON.stringify({ source, views:report.views.length, actions:report.actions.length, errors:report.errors.length }));
