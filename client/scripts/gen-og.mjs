#!/usr/bin/env node
// SameDayDesk's own face in a link preview: a share card per important page (the reticle on
// the drafting grid, the page's title, the site frame) and the icon set drawn from the same
// reticle. Rendered with system Chrome; without Chrome the committed images are kept.
//   node client/scripts/gen-og.mjs
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findChrome } from "../../tools/browser-smoke/lib.mjs";

const client = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(client, "public");
const font = (pkg, file) => pathToFileURL(join(client, "node_modules/@fontsource-variable", pkg, "files", file)).href;

// One card per page that people share. `file` is the path under public/.
export const CARDS = [
  { file: "og.png", fig: "Agent commerce", title: "Make your business usable by AI.", line: "Fixed prices. Working the same day." },
  { file: "og/x402.png", fig: "Agent payments", title: "AI agents pay for what they use.", line: "In the same request. No account, no key." },
  { file: "og/for-agents.png", fig: "For AI agents", title: "Fresh web data for your agent.", line: "Five pages, the fields you need, one cent." },
  { file: "og/receipts.png", fig: "Receipts", title: "Work delivered, and paid for.", line: "Every line links its proof." },
  { file: "og/ai-readiness.png", fig: "Free tool", title: "Can ChatGPT find your site?", line: "A free check, in plain words." },
];

const RETICLE = (stroke, w) => `<g fill="none" stroke="${stroke}" stroke-width="${w}">
  <circle cx="50" cy="50" r="46"/><circle cx="50" cy="50" r="30"/><circle cx="50" cy="50" r="13"/>
  <line x1="50" y1="0" x2="50" y2="100"/><line x1="0" y1="50" x2="100" y2="50"/></g>`;

const cardHtml = (c) => `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:SG;src:url(${font("space-grotesk", "space-grotesk-latin-wght-normal.woff2")})}
@font-face{font-family:JB;src:url(${font("jetbrains-mono", "jetbrains-mono-latin-wght-normal.woff2")})}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;overflow:hidden;position:relative;background:#f4f1ea;color:#1a1a1a;font-family:SG,sans-serif;
 background-image:linear-gradient(to right,#c9c4b8 1px,transparent 1px),linear-gradient(to bottom,#c9c4b8 1px,transparent 1px);background-size:56px 56px;background-position:-28px -28px}
.reticle{position:absolute;right:-120px;top:40px;width:620px;height:620px;opacity:.55}
.mark{position:absolute;width:26px;height:26px}.mark::before,.mark::after{content:"";position:absolute;background:#9e3b2e}
.mark::before{left:12px;top:0;width:1.5px;height:26px}.mark::after{top:12px;left:0;height:1.5px;width:26px}
.tl{left:22px;top:22px}.tr{right:22px;top:22px}.bl{left:22px;bottom:22px}.br{right:22px;bottom:22px}
.brand{position:absolute;left:84px;top:78px;display:flex;align-items:center;gap:16px;font-weight:600;font-size:34px;letter-spacing:-.02em}
.brand svg{width:46px;height:46px}
.fig{position:absolute;left:84px;top:236px;font-family:JB,monospace;font-size:20px;letter-spacing:.16em;text-transform:uppercase;color:#55524c}
.fig b{color:#9e3b2e;font-weight:600}
h1{position:absolute;left:84px;top:276px;width:860px;font-size:76px;line-height:1.02;letter-spacing:-.035em;font-weight:600}
.line{position:absolute;left:84px;bottom:76px;font-family:JB,monospace;font-size:22px;color:#55524c}
.url{position:absolute;right:84px;bottom:76px;font-family:JB,monospace;font-size:22px;color:#9e3b2e}
</style><body>
<svg class="reticle" viewBox="0 0 100 100">${RETICLE("#9e3b2e", 0.35)}</svg>
<span class="mark tl"></span><span class="mark tr"></span><span class="mark bl"></span><span class="mark br"></span>
<div class="brand"><svg viewBox="0 0 100 100"><rect x="6" y="6" width="88" height="88" rx="20" fill="#9e3b2e"/><path d="M33 29 L51 50 L33 71 Z M53 29 L71 50 L53 71 Z" fill="#f4f1ea"/></svg>SameDayDesk</div>
<p class="fig"><b>Fig. 01 /</b> ${c.fig}</p>
<h1>${c.title}</h1>
<p class="line">${c.line}</p><p class="url">samedaydesk.com</p></body>`;

// The icon: the reticle on a bone tile with the drafting grid.
export const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <!-- SameDayDesk: the drafting reticle on a bone tile. A dark browser bar gets the dark tile. -->
  <style>.t{fill:#f4f1ea}.g{stroke:#c9c4b8}.r{stroke:#9e3b2e}
  @media (prefers-color-scheme: dark){.t{fill:#101216}.g{stroke:#2a2d33}.r{stroke:#ccff00}}</style>
  <rect class="t" width="100" height="100" rx="22"/>
  <path class="g" stroke-width="2" d="M25 0V100M75 0V100M0 25H100M0 75H100"/>
  <g class="r" fill="none" stroke-width="6"><circle cx="50" cy="50" r="31"/><circle cx="50" cy="50" r="12"/></g>
  <path class="r" stroke-width="6" d="M50 8V92M8 50H92"/>
</svg>
`;
const iconHtml = (size, pad) => `<!doctype html><style>*{margin:0}body{width:${size}px;height:${size}px;overflow:hidden;background:#f4f1ea}
svg{display:block;width:${size - 2 * pad}px;height:${size - 2 * pad}px;margin:${pad}px}</style><body>${ICON_SVG.replace(/<style>[\s\S]*?<\/style>/, "<style>.t{fill:#f4f1ea}.g{stroke:#c9c4b8}.r{stroke:#9e3b2e}</style>")}</body>`;

function shoot(chrome, html, out, w, h) {
  const dir = mkdtempSync(join(tmpdir(), "sdd-og-"));
  const page = join(dir, "page.html");
  writeFileSync(page, html);
  mkdirSync(dirname(out), { recursive: true });
  execFileSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
    `--window-size=${w},${h}`, "--force-device-scale-factor=1", "--virtual-time-budget=2000", `--screenshot=${out}`, pathToFileURL(page).href], { stdio: "ignore" });
}

// An .ico holding one PNG (valid since Windows Vista and in every current browser).
function icoFromPng(png, size) {
  const head = Buffer.alloc(22);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
  head.writeUInt8(size >= 256 ? 0 : size, 6); head.writeUInt8(size >= 256 ? 0 : size, 7);
  head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12); head.writeUInt32LE(png.length, 14); head.writeUInt32LE(22, 18);
  return Buffer.concat([head, png]);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const chrome = findChrome();
  if (!chrome || spawnSync(chrome, ["--version"], { timeout: 5000, stdio: "ignore" }).status !== 0) {
    for (const file of [...CARDS.map(c => c.file), "favicon.svg", "favicon.ico", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "icon-512-maskable.png"]) {
      if (!existsSync(join(pub, file))) throw new Error("A committed share image is required when Chrome cannot run");
    }
    console.warn("gen-og: system Chrome cannot run; keeping the committed share images and icons."); process.exit(0);
  }
  for (const c of CARDS) shoot(chrome, cardHtml(c), join(pub, c.file), 1200, 630);
  writeFileSync(join(pub, "favicon.svg"), ICON_SVG);
  for (const [file, size, pad] of [["apple-touch-icon.png", 180, 0], ["icon-192.png", 192, 0], ["icon-512.png", 512, 0], ["icon-512-maskable.png", 512, 52], ["favicon-32.png", 32, 0]]) {
    shoot(chrome, iconHtml(size, pad), join(pub, file), size, size);
  }
  writeFileSync(join(pub, "favicon.ico"), icoFromPng(readFileSync(join(pub, "favicon-32.png")), 32));
  console.log(`gen-og: ${CARDS.length} share cards and the icon set`);
}
