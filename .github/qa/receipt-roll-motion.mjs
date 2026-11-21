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
const button = 'button[aria-controls="receipt-roll-screen"]';
const screen = '#receipt-roll-screen';
try {
  const page = await chrome.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument(() => {
    window.__offscreenRollReads = 0;
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      ...original,
      get() {
        const box = this.parentElement?.parentElement;
        if (box?.id === 'receipt-roll-screen') {
          const rect = box.getBoundingClientRect();
          if (rect.top >= innerHeight || rect.bottom <= 0) window.__offscreenRollReads++;
        }
        return original.get.call(this);
      },
    });
  });
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin === base.origin && request.method() === 'GET') void request.continue().catch(() => {});
    else void request.abort().catch(() => {});
  });
  assert.equal((await page.goto(base.href)).status(), 200);
  await page.waitForSelector(button, { visible: true });
  await page.waitForFunction(() => performance.getEntriesByName('sdd:react-ready').length > 0);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(() => window.__offscreenRollReads), 0);
  await page.$eval(screen, (el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForFunction((sel) => {
    const style = document.querySelector(sel)?.firstElementChild?.style;
    return style?.transform && style.transform !== 'translate3d(0, 0px, 0)';
  }, { timeout: 5000 }, screen);
  const screenHeight = await page.$eval(screen, (el) => el.getBoundingClientRect().height);
  await page.focus(button);
  await page.keyboard.press('Space');
  await page.waitForFunction((sel) => document.querySelector(sel)?.dataset.paused === 'true', {}, screen);
  assert.equal(await page.$eval(button, (el) => el.getAttribute('aria-pressed')), 'true');
  assert.deepEqual(await page.$eval(screen, (el) => [getComputedStyle(el).overflowY, el.tabIndex, getComputedStyle(el.firstElementChild).transform]),
    ['auto', 0, 'none']);
  await page.focus(screen);
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction((sel) => document.querySelector(sel).scrollTop > 0, { timeout: 3000 }, screen);
  await page.focus(button);
  await page.keyboard.press('Enter');
  assert.equal(await page.$eval(button, (el) => el.getAttribute('aria-pressed')), 'false');
  await page.waitForFunction((sel) => document.querySelector(sel)?.firstElementChild?.style.transform, {}, screen);

  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.reload();
  await page.waitForSelector(screen);
  assert.equal(await page.$eval(button, (el) => getComputedStyle(el).display), 'none');
  assert.equal(await page.$eval(screen, (el) => getComputedStyle(el).overflowY), 'auto');
  assert.equal(await page.$eval(screen, (el) => getComputedStyle(el.firstElementChild).transform), 'none');
  assert.equal(await page.$eval(screen, (el) => el.getBoundingClientRect().height), screenHeight);
  const lastLink = `${screen} ol:first-child li:last-child a`;
  await page.focus(lastLink);
  assert.equal(await page.$eval(lastLink, (el) => document.activeElement === el), true);
  console.log('SDS_ROLL_MOTION_OK offscreen_layout_reads=0 keyboard_pause=true keyboard_scroll=true resume=true reduced_motion=true last_receipt_focus=true');
} finally {
  await chrome.close();
}
