import { createServer as createNetServer } from "node:net";
import { existsSync } from "node:fs";

export const DESKTOP_VIEWPORT = Object.freeze({ width: 1440, height: 900, name: "desktop" });
export const MOBILE_VIEWPORT = Object.freeze({ width: 390, height: 844, name: "mobile", mobile: true });

export const PRODUCTION_HOSTS = Object.freeze([
  "samedaydesk.com",
  "www.samedaydesk.com",
  "agents.samedaydesk.com",
  "us.i.posthog.com",
  "app.posthog.com",
]);

const WRAPPER_CHROME = "/usr/local/bin/google-chrome";
const REAL_CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  "/opt/google/chrome/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

export function unusedPort() {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close((error) => (error ? reject(error) : resolve(port)));
    });
    probe.once("error", reject);
  });
}

export function findChrome() {
  for (const candidate of REAL_CHROME_CANDIDATES) {
    if (candidate === WRAPPER_CHROME) continue;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function isProductionHost(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
  return PRODUCTION_HOSTS.some((item) => host === item || host.endsWith(`.${item}`));
}

export function requestHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export function isLoopbackUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost" || parsed.hostname === "[::1]";
  } catch {
    return false;
  }
}

export function mimeFor(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html; charset=utf-8";
  if (lower.endsWith(".css")) return "text/css; charset=utf-8";
  if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".ico")) return "image/x-icon";
  if (lower.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (lower.endsWith(".xml")) return "application/xml; charset=utf-8";
  if (lower.endsWith(".webmanifest")) return "application/manifest+json";
  if (lower.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}

export function stripCssModulesGlobal(css) {
  return String(css).replaceAll(/:global\(([^)]+)\)/g, "$1");
}

export function rewriteSiteAnchors(html, localOrigin) {
  return String(html)
    .replaceAll('href="https://samedaydesk.com', `href="${localOrigin}`)
    .replaceAll("href='https://samedaydesk.com", `href='${localOrigin}`);
}

export function desktopChromeHtml(crawlerHtml) {
  return `<a class="skip-link" href="#main">Skip to content</a>
  <header class="nav">
    <div class="container inner">
      <a href="/" class="brand" aria-label="SameDayDesk home"><span class="word">SameDayDesk</span></a>
      <nav class="links" aria-label="Primary">
        <a href="/#services">Services</a>
        <a href="/#how">How it works</a>
        <a href="/tools/ai-readiness">Free tool</a>
      </nav>
      <div class="actions">
        <a href="/x402" class="x402" aria-label="Agent payments and x402 data gateway">
          <span class="x402Code">x402</span>
          <span class="x402Label">Agent payments</span>
        </a>
        <a href="/login" class="signin">Sign in</a>
      </div>
    </div>
  </header>
  <main id="main" class="wrap">${crawlerHtml}</main>`;
}

export function injectMockedRoot(indexHtml, { crawlerHtml, cssHrefs }) {
  let html = String(indexHtml);
  html = html.replace(/<script type="module" src="\/src\/main\.tsx"><\/script>/, "");
  const links = cssHrefs
    .map((href) => `    <link rel="stylesheet" href="${href}">`)
    .join("\n");
  html = html.replace("</head>", `${links}\n    <style>
      main.wrap pre, .jobPre { overflow-x: auto; white-space: pre; overflow-wrap: normal; }
      main.wrap pre code, .jobPre code { display: block; overflow-wrap: normal; }
    </style>\n  </head>`);
  if (!html.includes('<div id="root">')) {
    throw new Error("mocked SDS client: index.html missing #root");
  }
  html = html.replace(
    /<div id="root"><\/div>/,
    `<div id="root">${desktopChromeHtml(crawlerHtml)}</div>`,
  );
  return html;
}

export function parseViewport(value, fallback = DESKTOP_VIEWPORT) {
  if (!value) return { ...fallback };
  const match = String(value).match(/^(\d+)x(\d+)$/i);
  if (!match) throw new Error(`viewport must look like 1440x900, got ${value}`);
  return { width: Number(match[1]), height: Number(match[2]), name: fallback.name };
}

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--") {
      out._.push(...argv.slice(i + 1));
      break;
    }
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next == null || next.startsWith("--")) out[key] = true;
      else {
        out[key] = next;
        i += 1;
      }
    } else out._.push(token);
  }
  return out;
}
