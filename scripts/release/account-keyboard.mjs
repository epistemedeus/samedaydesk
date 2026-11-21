#!/usr/bin/env node
// Real local Auth and the configured test Payment Element, without submitting payment.
// SDS_LOCAL_AUTH_CONFIG names the private preview JSON. SDS_ACCOUNT_OUT names its receipt directory.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const source = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim(), "", "clean candidate required");
const config = JSON.parse(await readFile(process.env.SDS_LOCAL_AUTH_CONFIG, "utf8"));
const origin = config.SDS_PREVIEW_ORIGIN;
for (const value of [origin, config.VITE_SUPABASE_URL]) {
  const url = new URL(value);
  assert.equal(url.protocol, "http:");
  assert.equal(url.hostname, "127.0.0.1", "only an isolated loopback Auth preview is allowed");
}
const health = await fetch(`${origin}/api/health`);
assert.equal(health.headers.get("x-sds-private-source"), source, "preview must name this candidate");
const out = process.env.SDS_ACCOUNT_OUT || join(root, "release/out/account-keyboard");
await mkdir(out, { recursive: true });
const req = createRequire(join(root, "scripts/release/tools/package.json"));
const puppeteer = req("puppeteer-core");
const email = `keyboard-${randomUUID()}@example.test`, password = `${randomUUID()}Aa9!`;
const signup = await fetch(`${config.VITE_SUPABASE_URL}/auth/v1/signup`, {
  method: "POST", headers: { "Content-Type": "application/json", apikey: config.VITE_SUPABASE_ANON_KEY },
  body: JSON.stringify({ email, password }),
});
assert.ok((await signup.json()).user?.id, "real local Auth signup must issue an account");
const report = { source, scope: "local Auth, real test Payment Element, no payment submission", cycles: [] };
const browser = await puppeteer.launch({ executablePath: process.env.RELEASE_CHROME || "/usr/local/bin/google-chrome", headless: true, args: ["--disable-dev-shm-usage"] });
try {
  for (const width of [390, 768, 1440]) for (const theme of ["drafting", "dark"]) {
    const context = await browser.createBrowserContext(), page = await context.newPage();
    await page.bringToFront();
    await page.setViewport({ width, height: width === 390 ? 844 : 900 });
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    await page.evaluateOnNewDocument(t => localStorage.setItem("sdd-theme", t), theme);
    await page.goto(`${origin}/login`, { waitUntil: "networkidle2" });
    await page.type("input[type=email]", email);
    await page.type("input[type=password]", password);
    await page.click("button[type=submit]");
    await page.waitForFunction(() => location.pathname === "/dashboard");
    await page.goto(`${origin}/checkout?offer=agent_mcp_server`, { waitUntil: "networkidle2" });
    await page.waitForSelector("[data-payment-element] iframe");
    await page.waitForFunction(() => !document.body.innerText.includes("Preparing secure checkout"));
    let cardReady = false;
    for (const end = Date.now() + 30000; !cardReady && Date.now() < end;) {
      for (const frame of page.frames().filter(f => f.url().startsWith("https://js.stripe.com/v3/elements-inner"))) {
        const input = await frame.$("#Field-numberInput, #payment-numberInput, input[name=number]");
        if (input) { cardReady = Boolean((await input.boundingBox())?.width); await input.dispose(); }
        if (cardReady) break;
      }
      if (!cardReady) await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(cardReady, "the real Stripe card control must render before the keyboard cycle");
    await page.evaluate(() => { document.documentElement.tabIndex = -1; document.documentElement.focus(); document.documentElement.removeAttribute("tabindex"); });
    const row = { width, theme, complete: false, stops: [] };
    report.cycles.push(row);
    for (let i = 0; i < 100; i++) {
      await page.keyboard.press("Tab");
      await new Promise(resolve => setTimeout(resolve, 200));
      let frame = page.mainFrame(), handle, inPayment = false;
      for (let depth = 0; depth < 5; depth++) {
        handle = await frame.evaluateHandle(() => document.activeElement);
        if (await handle.evaluate(e => e?.tagName) !== "IFRAME") break;
        if (frame === page.mainFrame()) inPayment = await handle.evaluate(e => Boolean(e.closest("[data-payment-element]")));
        const child = await handle.asElement()?.contentFrame();
        if (!child) break;
        frame = child;
        await handle.dispose();
      }
      const bounds = await handle.asElement()?.boundingBox();
      const stop = await handle.evaluate(e => {
        if (!e || e === document.body) return null;
        window.__releaseFocusSeen ??= new Set();
        if (window.__releaseFocusSeen.has(e)) return null;
        window.__releaseFocusSeen.add(e);
        let visible = false;
        for (let indicator = e, depth = 0; indicator && depth < 3; indicator = indicator.parentElement, depth++) {
          const s = getComputedStyle(indicator);
          if (Number(s.opacity) === 0 || s.visibility === "hidden") continue;
          if ((s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== "none")) visible = true;
        }
        return { tag: e.tagName, type: e.getAttribute("type"), label: (e.getAttribute("aria-label") || e.getAttribute("name") || e.textContent || "").trim().slice(0, 80), visible };
      });
      await handle.dispose();
      if (!stop) { row.complete = true; break; }
      const pane = await page.$eval("[data-payment-element]", e => ({ top: e.getBoundingClientRect().top, bottom: e.getBoundingClientRect().bottom, scrollTop: e.scrollTop }));
      Object.assign(stop, { frame: frame === page.mainFrame() ? "application" : "Stripe", bounds, inPayment, pane });
      stop.inViewport = Boolean(bounds && bounds.y >= -2 && bounds.y + bounds.height <= page.viewport().height + 2);
      stop.inPane = !inPayment || Boolean(bounds && bounds.y >= pane.top - 2 && bounds.y + bounds.height <= pane.bottom + 2);
      if (stop.type === "file" || ["Card", "Country", "Privacy Policy"].includes(stop.label)) {
        stop.screenshot = `${width}-${theme}-focus-${row.stops.length + 1}.jpg`;
        await page.screenshot({ path: join(out, stop.screenshot), type: "jpeg", quality: 80 });
      }
      row.stops.push(stop);
    }
    await writeFile(join(out, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
    assert.ok(row.complete && row.stops.some(s => s.label === "Pay & send my task"), "complete cycle must reach payment submission");
    assert.ok(row.stops.every(s => s.visible && s.inViewport && s.inPane), "every focused control must be visible in its real viewport and pane");
    await context.close();
  }
  assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), source);
  assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim(), "", "candidate changed during keyboard acceptance");
  assert.equal((await fetch(`${origin}/api/health`)).headers.get("x-sds-private-source"), source);
  report.sourceUnchanged = true;
} finally {
  await browser.close();
  await writeFile(join(out, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify({ source, cycles: report.cycles.length, stops: report.cycles.map(r => r.stops.length), passed: true }));
