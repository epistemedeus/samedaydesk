#!/usr/bin/env node
// npm run release:sweep -- --cheap | --key | --pages /a,/b [--no-build] [--no-lighthouse] [--url http://127.0.0.1:PORT]
//
// --cheap   the pass bar's A lines on every sitemap page of the production build: status (200 or one
//           301), public copy check, internal and external links, console errors and failed requests
//           on load, axe serious or critical, machine files parse and their own links answer.
// --key     the B lines on the key pages of release/key-pages.json (and each listed state): captures at
//           390, 768 and 1440 px in light and dark, sideways scroll, axe, console errors while pressing
//           every in-page button, keyboard focus visibility, long motion under reduced motion, and
//           Lighthouse (mobile preset, simulated throttling, five runs, median, one page at a time,
//           load average recorded, runs without a trace rerun and not counted).
// --pages   the --cheap checks on the listed paths only.
//
// The preview is built and started from release/key-pages.json unless --url points at a running one.
// Browser tools live in scripts/release/tools (installed here on first use with npm ci).
// Output: release/out/sweep-<mode>.json, captures under release/out/key/.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const value = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const mode = flag("--key") ? "key" : flag("--pages") ? "pages" : "cheap";
const config = JSON.parse(readFileSync(join(root, "release/key-pages.json"), "utf8"));
if (value("--key-pages")) {
  const names = value("--key-pages").split(",");
  config.pages = config.pages.filter((p) => names.includes(p.name));
  if (config.pages.length !== names.length) throw new Error("Unknown key page selection");
}
const fixtures = value("--fixtures") ? JSON.parse(readFileSync(value("--fixtures"), "utf8")) : [];
const out = join(root, "release/out");
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const chrome = process.env.RELEASE_CHROME || ["/usr/bin/google-chrome", "/usr/local/bin/google-chrome", "/opt/google/chrome/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(existsSync);
if (!chrome) throw new Error("Set RELEASE_CHROME to a Chrome binary");

// Browser tools, pinned in scripts/release/tools/package-lock.json.
const tools = join(here, "tools");
if (!existsSync(join(tools, "node_modules", "puppeteer-core"))) {
  execFileSync("npm", ["ci", "--prefix", tools, "--ignore-scripts", "--no-audit", "--no-fund"], { stdio: "inherit" });
}
const req = createRequire(join(tools, "package.json"));
const { default: puppeteer } = await import(pathToFileURL(req.resolve("puppeteer-core")).href);
const axeSource = readFileSync(req.resolve("axe-core/axe.min.js"), "utf8");

// The preview.
let preview = value("--url");
let server, stopping = false;
const variant = mode === "key" && config.preview.keyEnv ? config.preview.keyEnv : {};
if (!preview) {
  // Preview env values may use {root} (the repository) and {out} (release/out) for absolute paths.
  const expand = (vars) => Object.fromEntries(Object.entries(vars ?? {}).map(([k, v]) => [k, String(v).replaceAll("{root}", root).replaceAll("{out}", out)]));
  const env = { ...process.env, ...expand(config.preview.env), ...expand(variant) };
  if (!flag("--no-build") && config.preview.build) {
    console.log(`build: ${config.preview.build}`);
    const b = spawnSync("bash", ["-c", config.preview.build], { cwd: root, env, stdio: "inherit" });
    if (b.status !== 0) throw new Error("preview build failed");
  }
  const port = config.preview.port;
  // Never measure someone else's server: the port must be free before this preview starts.
  if (await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) }).then(() => true, () => false)) {
    throw new Error(`port ${port} already answers; stop that server (or pass --url to sweep it on purpose)`);
  }
  server = spawn("bash", ["-c", config.preview.start], { cwd: root, env: { ...env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"], detached: true });
  let log = "";
  const serverLog = createWriteStream(join(out, "preview.log"));
  server.stdout.on("data", (c) => { log = (log + c).slice(-4000); serverLog.write(c); });
  server.stderr.on("data", (c) => { log = (log + c).slice(-4000); serverLog.write(c); });
  server.on("exit", (code, signal) => { if (!stopping) console.error(`preview exited (${code ?? signal}); its output is in release/out/preview.log`); });
  preview = `http://127.0.0.1:${port}`;
  let up = false;
  for (let i = 0; i < 90 && !up; i++) {
    await sleep(1000);
    up = await fetch(preview + (config.preview.ready ?? "/"), { signal: AbortSignal.timeout(3000) }).then((r) => r.status < 500, () => false);
  }
  if (!up) { console.error(log); stop(); throw new Error("preview did not start"); }
}
// SIGKILL: a preview holds no state, and the EIN entry keeps running after SIGTERM.
function stop() { stopping = true; if (server) try { process.kill(-server.pid, "SIGKILL"); } catch {} }
process.on("exit", stop);
process.on("SIGINT", () => { stop(); process.exit(130); });
const origin = new URL(config.origin).origin;
const toPreview = (u) => { const x = new URL(u, preview); if (x.origin === origin) return new URL(x.pathname + x.search, preview).href; return x.href; };
const localPath = (u) => { const x = new URL(u); return x.pathname + x.search; };

async function sitemapPaths() {
  const seen = new Set(), paths = new Set();
  const queue = [...(config.sitemaps ?? ["/sitemap.xml"])];
  while (queue.length) {
    const s = queue.shift();
    if (seen.has(s)) continue;
    seen.add(s);
    const res = await fetch(new URL(s, preview), { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`${s} answered ${res.status}`);
    const xml = await res.text();
    for (const [, loc] of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
      const p = localPath(loc.replace(/&amp;/g, "&"));
      if (/<sitemapindex/.test(xml)) queue.push(p); else paths.add(p);
    }
  }
  return [...paths].sort();
}

async function statusOf(path) {
  const first = await fetch(new URL(path, preview), { redirect: "manual", signal: AbortSignal.timeout(20000) });
  if (first.status === 200) return { path, status: 200, ok: true };
  if ([301, 308].includes(first.status)) {
    const to = first.headers.get("location");
    const second = await fetch(new URL(to, new URL(path, preview)), { redirect: "manual", signal: AbortSignal.timeout(20000) });
    return { path, status: first.status, to, then: second.status, ok: second.status === 200 };
  }
  return { path, status: first.status, ok: false };
}

async function pool(items, n, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; results[i] = await fn(items[i], i); }
  }));
  return results;
}

// Each ignore entry is { "pattern": regex, "why": reason }, kept in release/key-pages.json and reported.
const ignoredConsole = (config.ignoreConsole ?? []).map((x) => new RegExp(x.pattern ?? x));
const ignoredRequests = (config.ignoreRequests ?? []).map((x) => new RegExp(x.pattern ?? x));
const ignoredRequest = (u) => ignoredRequests.some((r) => r.test(u));
async function loadAndInspect(browser, path, { width = 1440, height = 900, theme = "light", reducedMotion = false, axe = true } = {}) {
  const page = await browser.newPage();
  const consoleErrors = [], failed = [];
  page.on("console", (m) => {
    if (m.type() !== "error" || ignoredConsole.some((r) => r.test(m.text()))) return;
    if (/^Failed to load resource/.test(m.text()) && ignoredRequest(m.location()?.url ?? "")) return;
    consoleErrors.push(m.text().slice(0, 300));
  });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${String(e.message ?? e).slice(0, 300)}`));
  page.on("requestfailed", (r) => { const u = r.url(); if (!u.startsWith("data:") && !ignoredRequest(u) && r.failure()?.errorText !== "net::ERR_ABORTED") failed.push(`${r.failure()?.errorText} ${u.slice(0, 200)}`); });
  page.on("response", (r) => { if (r.status() >= 400 && !r.url().startsWith("data:") && !ignoredRequest(r.url())) failed.push(`${r.status()} ${r.url().slice(0, 200)}`); });
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: theme }, { name: "prefers-reduced-motion", value: reducedMotion ? "reduce" : "no-preference" }]);
  let status = null;
  try {
    const res = await page.goto(new URL(path, preview).href, { waitUntil: "networkidle2", timeout: 45000 });
    status = res?.status() ?? null;
  } catch (e) { consoleErrors.push(`navigation: ${e.message.slice(0, 200)}`); }
  let violations = [];
  const isHtml = await page.evaluate(() => document.contentType === "text/html").catch(() => false);
  if (axe && isHtml) {
    try {
      await page.evaluate(axeSource);
      const r = await page.evaluate(async () => await window.axe.run(document, { resultTypes: ["violations"] }));
      violations = r.violations.filter((v) => ["serious", "critical"].includes(v.impact)).map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes[0]?.target?.join(" ") }));
    } catch (e) { violations = [{ id: "axe-error", impact: "critical", nodes: 0, sample: e.message.slice(0, 200) }]; }
  }
  const links = await page.$$eval("a[href]", (as) => as.map((a) => a.href)).catch(() => []);
  return { page, status, consoleErrors, failed, violations, links };
}

async function checkLinks(allLinks) {
  const internal = new Set(), external = new Set();
  for (const raw of allLinks) {
    let u; try { u = new URL(raw); } catch { continue; }
    if (!/^https?:$/.test(u.protocol)) continue;
    u.hash = "";
    if (u.origin === new URL(preview).origin || u.origin === origin) internal.add(u.pathname + u.search);
    else external.add(u.href);
  }
  const skipHosts = new Set(config.externalSkipHosts ?? []);
  const internalResults = await pool([...internal].sort(), 8, async (p) => {
    const expected = config.internalExpected?.[p.split("?")[0]];
    try { const r = await fetch(new URL(p, preview), { redirect: "follow", signal: AbortSignal.timeout(20000) }); return { url: p, status: r.status, ok: r.status < 400 || r.status === 402 || (expected && r.status === expected.status), ...(expected && r.status === expected.status ? { expected: expected.why } : {}) }; }
    catch (e) { return { url: p, status: null, ok: false, error: e.message }; }
  });
  const externalResults = await pool([...external].sort(), 6, async (href) => {
    const host = new URL(href).host;
    if (skipHosts.has(host)) return { url: href, host, ok: true, skipped: "listed host that blocks bots" };
    try {
      let r = await fetch(href, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(15000), headers: { "user-agent": "Mozilla/5.0 release-sweep" } });
      if (r.status >= 400) r = await fetch(href, { redirect: "follow", signal: AbortSignal.timeout(15000), headers: { "user-agent": "Mozilla/5.0 release-sweep" } });
      const blocked = [401, 403, 429, 999].includes(r.status);
      // 402 Payment Required is a paid (x402) route answering as it should.
      return { url: href, host, status: r.status, ok: r.status < 400 || r.status === 402, blockedByHost: blocked || undefined };
    } catch (e) { return { url: href, host, status: null, ok: false, error: e.message.slice(0, 120) }; }
  });
  return { internal: internalResults, external: externalResults };
}

async function machineFiles() {
  return pool(config.machineFiles ?? [], 4, async (p) => {
    const r = await fetch(new URL(p, preview), { signal: AbortSignal.timeout(15000) });
    const text = await r.text();
    const row = { path: p, status: r.status, ok: r.status === 200 && text.trim().length > 0, problems: [] };
    if (/\.json$/.test(p) || /json/.test(r.headers.get("content-type") ?? "")) {
      try { JSON.parse(text); } catch (e) { row.ok = false; row.problems.push(`does not parse: ${e.message}`); }
    }
    const own = [...new Set([...text.matchAll(/https?:\/\/[^\s)"'`<>\]]+/g)].map(([u]) => u.replace(/[.,;:]+$/, "")).filter((u) => !/[={]$|\{[^}]*\}/.test(u)).filter((u) => { try { return new URL(u).origin === origin; } catch { return false; } }))];
    for (const u of own) {
      // An endpoint that exists but wants another method or input (405, 400, 401, 402) is listed truly;
      // a POST-only route that answers GET with 404 is tried once with an empty JSON POST. Answers the
      // preview cannot give (no database) are listed with their reason in machineExpected.
      const exists = (r) => r && (r.status < 400 || [400, 401, 402, 405, 415, 422].includes(r.status));
      const path = localPath(u);
      let lr = await fetch(new URL(path, preview), { redirect: "follow", signal: AbortSignal.timeout(15000) }).catch(() => null);
      if (lr?.status === 404) lr = await fetch(new URL(path, preview), { method: "POST", headers: { "content-type": "application/json" }, body: "{}", redirect: "follow", signal: AbortSignal.timeout(15000) }).catch(() => null);
      const expected = config.machineExpected?.[path.replace(/\/$/, "")];
      if (expected && lr?.status === expected.status) row.expected = [...(row.expected ?? []), `${path}: ${expected.why}`];
      else if (!exists(lr)) { row.ok = false; row.problems.push(`lists ${path}, which answers ${lr?.status ?? "nothing"}`); }
    }
    row.ownLinks = own.length;
    return row;
  });
}

function runCommand(name, cmd) {
  const r = spawnSync("bash", ["-o", "pipefail", "-c", cmd], { cwd: root, env: { ...process.env, RELEASE_PREVIEW_URL: preview }, encoding: "utf8", maxBuffer: 64 << 20 });
  return { name, run: cmd, ok: r.status === 0, exit: r.status, tail: (r.stdout + r.stderr).split("\n").slice(-12).join("\n") };
}

async function cheap(paths) {
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--disable-dev-shm-usage", "--no-first-run"] });
  try {
    const statuses = await pool(paths, 8, (p) => statusOf(p).catch((e) => ({ path: p, ok: false, error: e.message })));
    const pages = await pool(paths, 3, async (p) => {
      const r = await loadAndInspect(browser, p);
      await r.page.close();
      return { path: p, consoleErrors: r.consoleErrors, failedRequests: [...new Set(r.failed)], axe: r.violations, links: r.links };
    });
    const links = await checkLinks(pages.flatMap((p) => p.links));
    const machine = await machineFiles();
    const commands = (config.cheapCommands ?? []).map((c) => runCommand(c.name, c.run));
    for (const p of pages) delete p.links;
    const lines = {
      A1_status: { ok: statuses.every((s) => s.ok), failures: statuses.filter((s) => !s.ok) },
      A2_copy: commands.filter((c) => c.name === "copy"),
      A3_links: { ok: links.internal.every((l) => l.ok) && links.external.every((l) => l.ok || l.blockedByHost), brokenInternal: links.internal.filter((l) => !l.ok), brokenExternal: links.external.filter((l) => !l.ok && !l.blockedByHost), blockedHosts: [...new Set(links.external.filter((l) => l.blockedByHost).map((l) => l.host))], checked: { internal: links.internal.length, external: links.external.length } },
      A4_console: { ok: pages.every((p) => !p.consoleErrors.length && !p.failedRequests.length), pages: pages.filter((p) => p.consoleErrors.length || p.failedRequests.length).map(({ path, consoleErrors, failedRequests }) => ({ path, consoleErrors, failedRequests })) },
      A5_axe: { ok: pages.every((p) => !p.axe.length), pages: pages.filter((p) => p.axe.length).map(({ path, axe }) => ({ path, axe })) },
      A6_machine: { ok: machine.every((m) => m.ok), files: machine },
      other: commands.filter((c) => c.name !== "copy"),
    };
    lines.A2_copy = { ok: lines.A2_copy.every((c) => c.ok), runs: lines.A2_copy };
    return lines;
  } finally { await browser.close(); }
}

async function waitIdle(maxMinutes) {
  const startedAt = Date.now();
  while (os.loadavg()[0] >= 1 && Date.now() - startedAt < maxMinutes * 60_000) await sleep(15000);
  return { load1: Math.round(os.loadavg()[0] * 100) / 100, waitedSeconds: Math.round((Date.now() - startedAt) / 1000), idle: os.loadavg()[0] < 1 };
}

async function lighthouseMedian(path) {
  const { default: lighthouse } = await import(pathToFileURL(req.resolve("lighthouse")).href);
  const idleWait = Number(value("--idle-wait") ?? 15);
  const runs = [];
  let attempts = 0;
  while (runs.filter((r) => r.valid).length < 5 && attempts < 9) {
    attempts++;
    const load = await waitIdle(idleWait);
    if (!load.idle) {
      runs.push({ attempt: attempts, load, valid: false, invalidBecause: "load average was 1 or more; Lighthouse was not started" });
      break;
    }
    const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--disable-dev-shm-usage", "--no-first-run"] });
    try {
      const port = new URL(browser.wsEndpoint()).port;
      const r = await lighthouse(new URL(path, preview).href, { port: Number(port), output: "json", logLevel: "error", onlyCategories: ["performance"], formFactor: "mobile", throttlingMethod: "simulate" });
      const a = r?.lhr?.audits ?? {};
      const hasTrace = Boolean(r?.artifacts?.Trace?.traceEvents?.length) && !r?.lhr?.runtimeError;
      const row = { attempt: attempts, load, lcpMs: a["largest-contentful-paint"]?.numericValue ?? null, cls: a["cumulative-layout-shift"]?.numericValue ?? null, tbtMs: a["total-blocking-time"]?.numericValue ?? null, runtimeError: r?.lhr?.runtimeError?.code };
      row.valid = hasTrace && load.idle && [row.lcpMs, row.cls, row.tbtMs].every(Number.isFinite);
      if (!load.idle) row.invalidBecause = "load average was 1 or more";
      else if (!hasTrace) row.invalidBecause = "no trace";
      runs.push(row);
    } catch (e) { runs.push({ attempt: attempts, valid: false, invalidBecause: e.message.slice(0, 160) }); }
    finally { await browser.close(); }
    if (!runs.at(-1).valid && runs.at(-1).invalidBecause === "load average was 1 or more" && attempts >= 2) break;
  }
  const valid = runs.filter((r) => r.valid);
  const med = (k) => { const xs = valid.map((r) => r[k]).sort((a, b) => a - b); return xs.length ? xs[Math.floor(xs.length / 2)] : null; };
  const m = { lcpMs: med("lcpMs"), cls: med("cls"), tbtMs: med("tbtMs") };
  const ok = valid.length === 5 && m.lcpMs <= 2500 && m.cls <= 0.1 && m.tbtMs <= 200;
  return { path, validRuns: valid.length, median: m, ok, state: valid.length < 5 ? "invalid (not counted)" : ok ? "passed" : "failed", runs };
}

async function key() {
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--disable-dev-shm-usage", "--no-first-run"] });
  const rows = [];
  try {
    const targets = config.pages.flatMap((p) => [{ name: p.name, path: p.path, page: p }, ...(p.states ?? []).map((s) => ({ name: `${p.name}--${s.name}`, path: s.path ?? p.path, page: p, state: s }))]);
    for (const t of targets) {
      const fixtureName = t.state?.name ?? (t.name === "care-subscription" ? "manage-renewal" : null);
      const fixture = fixtures.find((f) => f.name === fixtureName);
      if (fixture) t.path = fixture.path;
      if (t.state && !t.state.path && !fixture) {
        rows.push({ name: t.name, path: t.page.path, ok: false, problems: ["This state requires a live fixture; its description is not a receipt link."] });
        continue;
      }
      const dir = join(out, "key", t.name.replace(/[^a-z0-9-]+/gi, "-"));
      mkdirSync(dir, { recursive: true });
      const row = { name: t.name, path: t.path.split("#")[0], fixture: t.state?.fixture ?? t.page.fixture, captures: [], problems: [] };
      for (const width of [390, 768, 1440]) for (const theme of ["light", "dark"]) {
        const r = await loadAndInspect(browser, t.path, { width, height: width === 390 ? 844 : 900, theme });
        const geo = await r.page.evaluate(() => ({ sideways: document.documentElement.scrollWidth > window.innerWidth + 1, scrollWidth: document.documentElement.scrollWidth }));
        const file = join(dir, `${width}-${theme}.png`);
        await r.page.screenshot({ path: file, fullPage: true }).catch(() => {});
        row.captures.push({ width, theme, file: file.slice(root.length + 1), status: r.status, sideways: geo.sideways, axe: r.violations, consoleErrors: r.consoleErrors });
        if (geo.sideways) row.problems.push(`sideways scroll at ${width} ${theme} (${geo.scrollWidth}px)`);
        for (const v of r.violations) row.problems.push(`axe ${v.impact} ${v.id} at ${width} ${theme}`);
        for (const c of r.consoleErrors) row.problems.push(`console at ${width} ${theme}: ${c}`);
        await r.page.close();
      }
      // Actions, keyboard and motion at 1440 light.
      const r = await loadAndInspect(browser, t.path, { axe: false });
      const pageUrl = r.page.url();
      const before = r.consoleErrors.length;
      const buttons = await r.page.$$('button:not([type="submit"]):not([disabled]), [role="button"], summary');
      let pressed = 0;
      for (const b of buttons.slice(0, 40)) {
        const visible = await b.evaluate((el) => { const s = getComputedStyle(el); const rect = el.getBoundingClientRect(); return s.visibility !== "hidden" && s.display !== "none" && rect.width > 0 && rect.height > 0 && !el.closest("form[action]"); }).catch(() => false);
        if (!visible) continue;
        await b.click({ delay: 10 }).catch(() => {});
        pressed++;
        await sleep(150);
        if (r.page.url() !== pageUrl) { await r.page.goto(pageUrl, { waitUntil: "networkidle2" }).catch(() => {}); break; }
      }
      row.actions = { pressed, consoleErrors: r.consoleErrors.slice(before) };
      for (const c of row.actions.consoleErrors) row.problems.push(`console after an action: ${c}`);
      await r.page.goto(pageUrl, { waitUntil: "networkidle2" }).catch(() => {});
      const focus = [];
      for (let i = 0; i < 60; i++) {
        await r.page.keyboard.press("Tab");
        const f = await r.page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return null;
          const s = getComputedStyle(el);
          const visible = (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== "none");
          return { tag: el.tagName.toLowerCase(), label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40), visible };
        });
        if (!f) break;
        focus.push(f);
      }
      row.keyboard = { stops: focus.length, withoutVisibleFocus: focus.filter((f) => !f.visible).map((f) => `${f.tag} ${f.label}`) };
      for (const f of row.keyboard.withoutVisibleFocus) row.problems.push(`no visible focus: ${f}`);
      await r.page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
      await r.page.reload({ waitUntil: "networkidle2" }).catch(() => {});
      row.motion = await r.page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").map((a) => { const t = a.effect?.getTiming?.() ?? {}; return { name: a.animationName ?? a.constructor.name, duration: t.duration, iterations: t.iterations }; }).filter((a) => a.iterations === Infinity || (Number(a.duration) * Number(a.iterations || 1)) > 5000));
      for (const m of row.motion) row.problems.push(`motion over five seconds still running under reduced motion: ${m.name}`);
      await r.page.close();
      row.ok = row.problems.length === 0;
      rows.push(row);
      console.log(`${row.ok ? "ok  " : "look"} ${t.name} ${row.problems.length ? `(${row.problems.length} problems)` : ""}`);
    }
  } finally { await browser.close(); }
  const lighthouse = [];
  if (!flag("--no-lighthouse")) {
    for (const p of config.pages.filter((p) => p.lighthouse !== false)) {
      const lh = await lighthouseMedian(p.path);
      lighthouse.push(lh);
      console.log(`lighthouse ${p.path}: ${lh.state} LCP ${lh.median.lcpMs} CLS ${lh.median.cls} TBT ${lh.median.tbtMs} (${lh.validRuns} valid runs)`);
    }
  }
  return { B1_B3: rows, B4_lighthouse: lighthouse };
}

const startedAt = new Date().toISOString();
let result;
if (mode === "key") result = await key();
else {
  const paths = mode === "pages" ? value("--pages").split(",") : await sitemapPaths();
  console.log(`${paths.length} pages`);
  result = { pages: paths.length, ...(await cheap(paths)) };
}
const report = { site: config.site, commit: sha, mode, preview, startedAt, finishedAt: new Date().toISOString(), loadAverage: os.loadavg(), result };
const passed = mode === "key"
  ? result.B1_B3.every((r) => r.ok) && result.B4_lighthouse.every((l) => l.ok)
  : Object.values(result).filter((x) => x && typeof x === "object" && "ok" in x).every((x) => x.ok) && result.other.every((c) => c.ok);
report.state = passed ? "passed" : "failed";
writeFileSync(join(out, `sweep-${mode}.json`), JSON.stringify(report, null, 2) + "\n");
if (mode !== "key") for (const [k, v] of Object.entries(result)) if (v && typeof v === "object" && "ok" in v) console.log(`${v.ok ? "passed" : "failed"} ${k}`);
console.log(`${report.state}: release/out/sweep-${mode}.json`);
stop();
process.exit(passed ? 0 : 1);
