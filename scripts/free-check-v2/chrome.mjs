// Controller-only bootstrap over the pinned kit's public package exports.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
const [kit, cacheDir, output, mode] = process.argv.slice(2);
const require = createRequire(join(kit, 'package.json'));
const { install, Browser } = await import(pathToFileURL(require.resolve('@puppeteer/browsers')).href);
const { PUPPETEER_REVISIONS } = await import(pathToFileURL(require.resolve('puppeteer-core/internal/revisions.js')).href);
if (typeof install !== 'function' || Browser.CHROME !== 'chrome' || !/^\d+(?:\.\d+){3}$/.test(PUPPETEER_REVISIONS.chrome)) throw Error('Pinned browser installer API unavailable');
if (mode === '--check') {
  console.log(JSON.stringify({ ok: true, browser: Browser.CHROME, buildId: PUPPETEER_REVISIONS.chrome, downloadAttempted: false }));
} else {
  const result = await install({ browser: Browser.CHROME, buildId: PUPPETEER_REVISIONS.chrome, cacheDir });
  await writeFile(output, result.executablePath + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ browser: 'Chrome for Testing', buildId: PUPPETEER_REVISIONS.chrome }));
}
