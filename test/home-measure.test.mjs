import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import express from "express";
import {
  BUCKETS,
  LEGEND,
  MAX_DAYS,
  MAX_SERIALIZED_BYTES,
  classifyHomeView,
  createHomeMeasure,
  machineSurfaceHost,
} from "../server/lib/home-measure.js";
import { createHomeMeasureRouter } from "../server/routes/home-measure.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BROWSER =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const SECRET = "never-store-me-203.0.113.9-sdd_attr=leak";

function req({ method = "GET", path: p = "/", ua = BROWSER, referer, extraHeaders = {} } = {}) {
  return {
    method,
    path: p,
    ip: "203.0.113.9",
    headers: {
      "user-agent": ua,
      referer,
      "x-forwarded-for": "203.0.113.9, 198.51.100.10",
      cookie: "sdd_attr=direct|/|2026-08-20; secret=never-store-me",
      ...extraHeaders,
    },
  };
}

function snapshotHasLeak(snap, ...needles) {
  const raw = JSON.stringify(snap);
  return needles.some((n) => n && raw.includes(n));
}

test("declared crawlers are crawler_fetch, never ordinary or click-through", () => {
  for (const ua of ["GPTBot/1.2", "OAI-SearchBot/1.4", "ClaudeBot/1.0", "Googlebot/2.1", "PerplexityBot/1.0"]) {
    assert.equal(classifyHomeView({ ua, referer: "https://chatgpt.com/" }), "crawler_fetch", ua);
  }
});

test("same-session agent user agents are agent_fetch, not click-through", () => {
  for (const ua of ["ChatGPT-User/1.0", "Claude-User/1.0", "Perplexity-User/1.0", "curl/8.14.1"]) {
    assert.equal(classifyHomeView({ ua, referer: "https://chatgpt.com/" }), "agent_fetch", ua);
  }
});

test("a browser from a tight AI surface is machine_click_through", () => {
  assert.equal(classifyHomeView({ ua: BROWSER, referer: "https://chatgpt.com/c/123" }), "machine_click_through");
  assert.equal(classifyHomeView({ ua: BROWSER, referer: "https://chat.openai.com/" }), "machine_click_through");
  assert.equal(classifyHomeView({ ua: BROWSER, referer: "https://claude.ai/chat/1" }), "machine_click_through");
  assert.equal(classifyHomeView({ ua: BROWSER, referer: "https://www.perplexity.ai/search/x" }), "machine_click_through");
  assert.equal(classifyHomeView({ ua: BROWSER, referer: "https://grok.com/" }), "machine_click_through");
  assert.equal(classifyHomeView({ ua: BROWSER, referer: "https://copilot.microsoft.com/" }), "machine_click_through");
});

test("organic Bing, openai.com docs, and direct visits are ordinary, never upgraded", () => {
  assert.equal(classifyHomeView({ ua: BROWSER }), "ordinary_view");
  assert.equal(classifyHomeView({ ua: BROWSER, referer: "https://www.bing.com/search?q=samedaydesk" }), "ordinary_view");
  assert.equal(classifyHomeView({ ua: BROWSER, referer: "https://openai.com/index" }), "ordinary_view");
  assert.equal(classifyHomeView({ ua: BROWSER, referer: "https://news.ycombinator.com/" }), "ordinary_view");
  assert.equal(machineSurfaceHost("bing.com"), null);
  assert.equal(machineSurfaceHost("openai.com"), null);
});

test("empty user agent is unresolved, not human", () => {
  assert.equal(classifyHomeView({ ua: "" }), "unresolved");
  assert.equal(classifyHomeView({}), "unresolved");
});

test("legend labels measured vs inferred vs posted-only", () => {
  assert.equal(LEGEND.crawler_fetch.status, "measured");
  assert.equal(LEGEND.machine_click_through.status, "measured");
  assert.equal(LEGEND.ordinary_view.status, "inferred");
  assert.equal(LEGEND.mail_cta.status, "measured-if-posted");
  assert.equal(LEGEND.agent_fetch.status, "measured");
  assert.equal(LEGEND.unresolved.status, "measured");
});

test("recordView stores only integer buckets and discards IP, UA, cookie, and referer", () => {
  const m = createHomeMeasure({ file: ":memory:", now: () => new Date("2026-08-20T12:00:00Z") });
  m.recordView(req({ ua: "GPTBot/1.2" }));
  m.recordView(req({ ua: BROWSER, referer: "https://chatgpt.com/c/1" }));
  m.recordView(req({ ua: BROWSER }));
  m.recordView(req({ ua: "ChatGPT-User/1.0" }));
  m.recordView(req({ ua: "" }));
  m.recordView(req({ method: "POST" }));
  m.recordView(req({ path: "/for-agents" }));
  m.recordView(req({ extraHeaders: { purpose: "prefetch" } }));
  const snap = m.snapshot();
  assert.deepEqual(snap.days["2026-08-20"], {
    crawler_fetch: 1,
    machine_click_through: 1,
    mail_cta: 0,
    ordinary_view: 1,
    agent_fetch: 1,
    unresolved: 1,
  });
  assert.equal(Object.keys(snap.days["2026-08-20"]).sort().join(","), [...BUCKETS].sort().join(","));
  assert.equal(snapshotHasLeak(snap, "203.0.113.9", "198.51.100.10", BROWSER, "chatgpt.com/c/1", "sdd_attr", "never-store-me", SECRET), false);
  assert.equal("uniqueHumans" in snap, false);
  assert.equal("recent" in snap, false);
  assert.equal("byPath" in snap, false);
});

test("POST /i/mail is the only mail_cta increment; GET does not count", () => {
  const m = createHomeMeasure({ file: ":memory:", now: () => new Date("2026-08-20T12:00:00Z") });
  m.recordMail({ method: "POST" });
  m.recordMail({ method: "GET" });
  m.recordView(req({ path: "/i/mail", method: "GET" }));
  assert.equal(m.snapshot().totals.mail_cta, 1);
});

test("storage is bounded to 90 UTC days and stays under the byte cap", () => {
  let t = Date.parse("2026-01-01T00:00:00Z");
  const m = createHomeMeasure({
    file: ":memory:",
    maxDays: MAX_DAYS,
    now: () => new Date(t),
  });
  for (let i = 0; i < MAX_DAYS + 15; i++) {
    t = Date.parse("2026-01-01T00:00:00Z") + i * 86400000;
    m.recordView(req());
  }
  const snap = m.snapshot();
  const keys = Object.keys(snap.days);
  assert.equal(keys.length, MAX_DAYS);
  assert.equal(keys[0], "2026-01-16");
  assert.equal(keys[keys.length - 1], "2026-04-15");
  assert.ok(m.serializedBytes() < MAX_SERIALIZED_BYTES);
});

test("load strips unknown fields, paths, IPs, and non-day keys", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-home-measure-"));
  const file = path.join(dir, "state.json");
  fs.writeFileSync(
    file,
    JSON.stringify({
      v: 1,
      ua: BROWSER,
      ip: "203.0.113.9",
      recent: [{ p: "/", ua: BROWSER }],
      days: {
        "2026-08-20": { crawler_fetch: 2, ordinary_view: 3, secret: 9, ua: BROWSER },
        "../etc/passwd": { crawler_fetch: 1 },
        "not-a-day": { ordinary_view: 4 },
      },
    }),
  );
  const m = createHomeMeasure({ file, now: () => new Date("2026-08-20T12:00:00Z") });
  const snap = m.snapshot();
  assert.deepEqual(Object.keys(snap.days), ["2026-08-20"]);
  assert.deepEqual(snap.days["2026-08-20"], {
    crawler_fetch: 2,
    machine_click_through: 0,
    mail_cta: 0,
    ordinary_view: 3,
    agent_fetch: 0,
    unresolved: 0,
  });
  assert.equal(snapshotHasLeak(snap, "203.0.113.9", BROWSER, "recent", "../etc/passwd"), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("persisted file is aggregates only and mode 0600", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-home-measure-"));
  const file = path.join(dir, "state.json");
  const m = createHomeMeasure({ file, now: () => new Date("2026-08-20T12:00:00Z") });
  m.recordView(req({ ua: "GPTBot/1.2" }));
  const disk = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.deepEqual(Object.keys(disk).sort(), ["days", "v"]);
  assert.equal(disk.v, 1);
  assert.equal(fs.statSync(file).mode & 0o077, 0, "group and other must not read the aggregate file");
  assert.equal(JSON.stringify(disk).includes("203.0.113.9"), false);
  assert.equal(JSON.stringify(disk).includes("GPTBot"), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("homepage source bytes are unchanged from 3069b83 and do not mention the sidecar", () => {
  const home = fs.readFileSync(path.join(root, "client/public/home.html"));
  const base = execFileSync("git", ["show", "3069b83:client/public/home.html"], { cwd: root });
  assert.equal(crypto.createHash("sha256").update(home).digest("hex"), "de79158b3a111888e9ec3ad6d8bfbbd9994e45c653b912835f2bc7f229f4b89c");
  assert.equal(Buffer.compare(home, base), 0);
  const text = home.toString("utf8");
  assert.ok(text.includes("mailto:contact@samedaydesk.com"));
  assert.ok(text.includes("https://agents.samedaydesk.com/"));
  assert.equal(text.includes("/i/mail"), false);
  assert.equal(text.includes("home-measure"), false);
  assert.equal(/posthog|gtag|google-analytics|plausible|umami|pixel/i.test(text), false);
});

test("token-gated snapshot is 404 without a token and never sets a cookie", async () => {
  const m = createHomeMeasure({ file: ":memory:", now: () => new Date("2026-08-20T12:00:00Z") });
  const app = express();
  app.disable("x-powered-by");
  app.use(m.middleware);
  app.use("/api/home-measure", createHomeMeasureRouter(m));
  app.post("/i/mail", m.mailIntent);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    const missing = await fetch(`${base}/api/home-measure`);
    assert.equal(missing.status, 404);
    process.env.HOMEPAGE_MEASURE_TOKEN = "test-token";
    m.recordView(req({ ua: "GPTBot/1.2" }));
    const denied = await fetch(`${base}/api/home-measure`);
    assert.equal(denied.status, 404);
    const ok = await fetch(`${base}/api/home-measure`, { headers: { "x-homepage-measure-token": "test-token" } });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("set-cookie"), null);
    const body = await ok.json();
    assert.equal(body.totals.crawler_fetch, 1);
    assert.equal(JSON.stringify(body).includes("203.0.113.9"), false);
    const mail = await fetch(`${base}/i/mail`, { method: "POST" });
    assert.equal(mail.status, 204);
    assert.equal(mail.headers.get("set-cookie"), null);
    assert.equal(m.snapshot().totals.mail_cta, 1);
    const getMail = await fetch(`${base}/i/mail`);
    assert.equal(getMail.status, 404);
  } finally {
    delete process.env.HOMEPAGE_MEASURE_TOKEN;
    await new Promise((resolve) => server.close(resolve));
  }
});
