import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(process.env.SDS_BROWSER_MODULES + '/package.json');
const origin = process.env.SDS_PREVIEW_ORIGIN || 'http://127.0.0.1:31861';
const out = process.env.SDS_STRIP_OUT || '/tmp/sds-receipt-strip';
await mkdir(out + '/screenshots', { recursive: true });
const browser = await require('puppeteer-core').launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome-stable', headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const report = {
  source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  criteria: 'Native Tab exposes an unmasked focus outline; actual arrow keys reveal overflowing text. No script scroll is used to reveal a focused link.',
  cases: [],
};
try {
  for (const reduced of [true, false]) for (const width of [390, 768, 1440]) for (const theme of ['drafting', 'dark']) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width, height: 900 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }]);
    await page.evaluateOnNewDocument(t => localStorage.setItem('sdd-theme', t), theme);
    await page.goto(origin + '/x402', { waitUntil: 'networkidle0' });
    await page.$eval('[class*="stripWindow"]', e => e.scrollIntoView({ block: 'center' }));
    await page.bringToFront();
    const links = [];
    for (const handle of await page.$$('[class*="stripTrack"] a[href]')) {
      if (await handle.evaluate(e => e.tabIndex >= 0 && !e.closest('[aria-hidden="true"]'))) links.push(handle);
    }
    assert.equal(links.length, 8);
    await links[0].focus();
    const focus = [];
    for (let i = 0; i < links.length; i++) {
      if (i) await page.keyboard.press('Tab');
      const measure = () => links[i].evaluate(e => {
        const pane = e.closest('[class*="stripWindow"]');
        const a = e.getBoundingClientRect(), v = pane.getBoundingClientRect();
        const style = getComputedStyle(e), track = getComputedStyle(e.closest('[class*="stripTrack"]'));
        const mask = getComputedStyle(pane).maskImage === 'none' ? 0 : v.width * .05;
        return {
          focused: document.activeElement === e,
          visibleUnmaskedWidth: Math.max(0, Math.min(a.right, v.right - mask, innerWidth) - Math.max(a.left, v.left + mask, 0)),
          fullViewportTargetWidth: Math.min(a.width, v.width - mask * 2),
          targetWidth: a.width, viewportWidth: v.width, scrollLeft: pane.scrollLeft,
          outline: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0,
          animation: track.animationName,
        };
      });
      const nativeTab = await measure();
      assert.equal(nativeTab.focused, true);
      assert.ok(nativeTab.visibleUnmaskedWidth > 1, JSON.stringify({ width, theme, reduced, i, nativeTab }));
      assert.equal(nativeTab.outline, true);
      assert.equal(nativeTab.animation, 'none');
      const item = { nativeTab };
      if (nativeTab.visibleUnmaskedWidth < nativeTab.fullViewportTargetWidth * .9) {
        let after = nativeTab, keys = 0;
        while (after.visibleUnmaskedWidth < after.fullViewportTargetWidth * .9 && keys < 20) {
          await page.keyboard.press('ArrowRight');
          await new Promise(resolve => setTimeout(resolve, 150));
          after = await measure(); keys++;
        }
        assert.ok(after.visibleUnmaskedWidth >= after.fullViewportTargetWidth * .9, JSON.stringify({ width, theme, reduced, i, after }));
        item.actualArrowReveal = { keys, after };
      }
      focus.push(item);
    }
    // Let the preceding native ArrowRight scroll finish before reversing direction.
    await page.$eval('[class*="stripWindow"]', async pane => {
      let prior = pane.scrollLeft, lastChange = performance.now();
      const deadline = performance.now() + 3000;
      while (performance.now() < deadline) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        if (pane.scrollLeft !== prior) { prior = pane.scrollLeft; lastChange = performance.now(); }
        if (performance.now() - lastChange >= 160) return;
      }
      throw new Error('Native receipt scrolling did not settle');
    });
    const before = await page.$eval('[class*="stripWindow"]', e => e.scrollLeft);
    assert.ok(before > 0);
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(value => document.querySelector('[class*="stripWindow"]').scrollLeft < value, { timeout: 3000 }, before);
    const after = await page.$eval('[class*="stripWindow"]', e => e.scrollLeft);
    const screenshot = `screenshots/${width}-${theme}-${reduced ? 'reduced' : 'normal'}.jpg`;
    await page.screenshot({ path: out + '/' + screenshot, type: 'jpeg', quality: 85 });
    report.cases.push({ width, theme, reduced, links: links.length, focus, arrows: { before, after }, screenshot });
    await context.close();
    console.log('RECEIPT_STRIP', width, theme, reduced);
  }
} finally {
  await browser.close();
  await writeFile(out + '/report.json', JSON.stringify(report, null, 2));
}
