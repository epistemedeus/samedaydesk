// Rendered text for the free check: open the page in headless Chrome behind the guard and count
// the words a reader sees once scripts have run. Returns the free check's `rendered` observation
// ({ words, extraWords }) plus what the guard did. Never submits, clicks or types anything.
import puppeteer from "puppeteer-core";
import { startGuard } from "./guard.mjs";

const PAGE_SCHEMES = /^(?:https?|data|blob):/i;
// Bot walls: a challenge page is not the site's text, so it is reported, never counted.
const CHALLENGE = /checking your browser|just a moment|verify you are (?:a )?human|security checkpoint|attention required|enable javascript and cookies|access denied/i;

/**
 * render(url, { initialWords, budgetMs, chrome, guard }) -> { words, extraWords, challenged, ms, requests, bytes, refused, capped }
 * Throws if the page cannot be measured inside the budget; the caller keeps the check Not verified,
 * and does the same when `challenged` is true (a bot wall was all the browser was shown).
 */
export async function render(url, { initialWords = 0, budgetMs = 8_000, chrome = process.env.FREE_CHECK_CHROME || "/usr/bin/google-chrome", guard: guardOptions = {} } = {}) {
  const target = new URL(url);
  if (!["http:", "https:"].includes(target.protocol) || target.username || target.password) throw Error("Only public http(s) URLs without credentials.");
  const started = Date.now();
  const guard = await startGuard(guardOptions);
  const browser = await puppeteer.launch({
    executablePath: chrome, headless: true,
    args: [
      `--proxy-server=http://127.0.0.1:${guard.port}`,
      "--proxy-bypass-list=<-loopback>", // loopback too goes through the guard
      "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1", // Chrome resolves nothing itself
      "--disable-quic", "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
      "--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run",
      "--disable-features=PrivateNetworkAccessSendPreflights,MediaRouter,DnsOverHttps",
      "--disable-dev-shm-usage", // Chrome's own sandbox stays on: these are untrusted pages
    ],
  });
  // A hard stop the page cannot outlive.
  const kill = setTimeout(() => { browser.process()?.kill("SIGKILL"); }, budgetMs + 4_000);
  try {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setJavaScriptEnabled(true);
    // A headless user agent is refused outright by common bot protection; present as ordinary Chrome.
    await page.setUserAgent((await browser.userAgent()).replace("HeadlessChrome", "Chrome"));
    await page.setRequestInterception(true);
    page.on("request", (request) => (PAGE_SCHEMES.test(request.url()) && request.resourceType() !== "websocket" ? request.continue() : request.abort("blockedbyclient")));
    // No direct UDP and no popups: WebRTC and window.open are removed before any page script runs.
    await page.evaluateOnNewDocument(() => {
      for (const name of ["RTCPeerConnection", "webkitRTCPeerConnection", "RTCDataChannel"]) { try { delete window[name]; } catch {} }
      window.open = () => null;
    });
    const remaining = () => Math.max(500, budgetMs - (Date.now() - started));
    // The page itself must load: a refused address or an HTTP error is not a page to measure.
    const response = await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: remaining() });
    if (!response || response.status() >= 400) throw Error(`The page was not loaded (HTTP ${response?.status() ?? "none"}; refused: ${guard.stats.refused.slice(0, 3).join(", ") || "none"}).`);
    // Let scripts render: wait for the network to go quiet, but never past the budget.
    await page.waitForNetworkIdle({ idleTime: 500, timeout: remaining() }).catch(() => {});
    const { words, title, text } = await page.evaluate(() => {
      const body = document.body?.innerText || "";
      return { words: body.split(/\s+/).filter(Boolean).length, title: document.title, text: body.slice(0, 2000) };
    });
    const challenged = words < 200 && CHALLENGE.test(`${title} ${text}`);
    return { words, extraWords: challenged ? 0 : Math.max(0, words - initialWords), challenged, ms: Date.now() - started, requests: guard.stats.requests, bytes: guard.stats.bytes, refused: guard.stats.refused.slice(0, 20), capped: guard.stats.capped };
  } finally {
    clearTimeout(kill);
    await browser.close().catch(() => browser.process()?.kill("SIGKILL"));
    await guard.close();
  }
}
