# Browser smoke (local only)

Headless desktop (and reusable fixture) acceptance for SDS agent / recurring-job surfaces.

Playwright and Puppeteer are **not** in the lockfile, so this pack uses the system Chrome binary plus `node:http` and the Chrome DevTools Protocol. Do not call `/usr/local/bin/google-chrome`: that wrapper pins the shared profile and port 9222. Use `/opt/google/chrome/google-chrome` or `CHROME_BIN`.

No production `samedaydesk.com` / `agents.samedaydesk.com` fetches. Chrome is launched with `MAP * ~NOTFOUND` except loopback.

```bash
# Desktop viewport 1440x900 against a mocked SDS client + recipe fixture pages
node tools/browser-smoke/desktop.mjs --out /tmp/sds-browser-desktop
node --test tools/browser-smoke/desktop.test.mjs

# Mobile viewport 390x844: launch Chrome at that size (do not resize a 1440 session)
node tools/browser-smoke/mobile.mjs --out /tmp/sds-browser-mobile
node --test tools/browser-smoke/mobile.test.mjs

# Fixture server only (S08/S09 share createMockedSdsOrigin; do not leave it listening)
node tools/browser-smoke/fixture-server.mjs
```

Nearest non-browser commands for the same copy:

```bash
node --test server/scripts/test-spa-route-shells.js
node server/scripts/test-for-agents-code-overflow.js
```
