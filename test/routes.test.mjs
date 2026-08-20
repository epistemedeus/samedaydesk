import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

// Boots the real server with no environment keys at all, which is also the shape of the
// production smoke: everything must serve, and every integration must degrade in the open.
const PORT = 4187;
const BASE = `http://127.0.0.1:${PORT}`;
let child;

before(async () => {
  child = spawn(process.execPath, ["server/index.js"], {
    env: { ...process.env, NODE_ENV: "production", PORT: String(PORT), OPENAI_API_KEY: "", TURNSTILE_SITE_KEY: "", TURNSTILE_SECRET_KEY: "", ADMIN_METRICS_TOKEN: "" },
    stdio: "ignore",
  });
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(`${BASE}/api/health`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error("server did not start");
});

after(() => child?.kill());

test("the homepage is a document, not an app shell", async () => {
  const res = await fetch(`${BASE}/`, { headers: { "User-Agent": "OAI-SearchBot/1.4" } });
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.match(html, /<h1>ChatGPT still quotes a price you changed two years ago\.<\/h1>/);
  for (const price of ["$490", "$2,400", "$4,800"]) assert.ok(html.includes(price), `first HTML is missing ${price}`);
  assert.ok(!html.includes("<div id=\"root\"></div>"), "the app shell answered for the homepage");
});

test("a crawler and a browser get the same bytes", async () => {
  const [a, b] = await Promise.all([
    fetch(`${BASE}/`, { headers: { "User-Agent": "OAI-SearchBot/1.4" } }).then((r) => r.text()),
    fetch(`${BASE}/`, { headers: { "User-Agent": "Mozilla/5.0 Chrome/120 Safari/537.36" } }).then((r) => r.text()),
  ]);
  assert.equal(a, b);
});

test("retired URLs return their declared status", async () => {
  const redirect = await fetch(`${BASE}/ai-visibility-audit.html`, { redirect: "manual" });
  assert.equal(redirect.status, 301);
  assert.equal(new URL(redirect.headers.get("location"), BASE).pathname, "/");

  const guide = await fetch(`${BASE}/guides/how-to-get-cited-by-ai-search-2026.html`, { redirect: "manual" });
  assert.equal(guide.status, 301);
  assert.equal(new URL(guide.headers.get("location"), BASE).pathname, "/guides/get-cited-by-ai-search.html");
});

test("a URL that does not exist returns 404, not the homepage", async () => {
  for (const p of ["/this-page-does-not-exist-9f3a", "/guides/nope.html", "/pay/nope"]) {
    const res = await fetch(`${BASE}${p}`);
    assert.equal(res.status, 404, `${p} did not 404`);
  }
});

test("every money page serves without any environment key", async () => {
  for (const p of ["/", "/report", "/pay/audit", "/pay/sprint", "/pay/sprint-plus", "/methods", "/terms", "/for-agents", "/audit/samedaydesk/2026-08-19/", "/llms.txt", "/sitemap.xml", "/robots.txt", "/site.css", "/.well-known/agent-card.json"]) {
    const res = await fetch(`${BASE}${p}`);
    assert.equal(res.status, 200, `${p} returned ${res.status}`);
  }
});

test("the app shell still serves its own routes", async () => {
  for (const p of ["/tools/ai-readiness", "/x402", "/login", "/checkout", "/privacy"]) {
    const res = await fetch(`${BASE}${p}`);
    assert.equal(res.status, 200, `${p} returned ${res.status}`);
  }
});

test("checkout refuses a retired slug and an incomplete form", async () => {
  const retired = await fetch(`${BASE}/api/checkout/session`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "offer=lead_list&site_url=example.com&brand_name=x&delivery_email=a@b.co",
  });
  assert.equal(retired.status, 400);

  const incomplete = await fetch(`${BASE}/api/checkout/session`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "offer=answer_audit&site_url=&brand_name=&delivery_email=nope",
  });
  assert.equal(incomplete.status, 400);
});

test("with no payment keys the pay path says so instead of failing silently", async () => {
  const res = await fetch(`${BASE}/api/checkout/session`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "offer=answer_audit&site_url=example.com&brand_name=Example&delivery_email=a@b.co",
  });
  assert.equal(res.status, 503);
  assert.match(await res.text(), /Payments are not switched on/);
});

test("the report runs its checks and promises nothing about engines when the panel is off", async () => {
  const res = await fetch(`${BASE}/report`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "site_url=example.com&brand=Example",
  });
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.match(html, /The answer panel is not switched on for this deployment/);
  assert.ok(!html.includes("/pay/audit"), "a clean panel-off report must not show a paid button");
});

test("the report button copy matches what the deployment can deliver", async () => {
  const html = await fetch(`${BASE}/report`).then((r) => r.text());
  assert.match(html, /Check this site\. Eligibility result on the next page\. No email\./);
  assert.ok(!html.includes("Quotes on the next page"), "panel-off copy must not promise quotes");
});

test("the metrics endpoint does not exist without its token", async () => {
  const res = await fetch(`${BASE}/api/metrics`);
  assert.equal(res.status, 404);
});

test("the intake page refuses a request with no session", async () => {
  const res = await fetch(`${BASE}/intake`);
  assert.equal(res.status, 400);
});
