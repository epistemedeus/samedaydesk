// Homepage measurement sidecar.
//
// Counts GET / into daily UTC buckets, plus POST /i/mail as mail CTA intent.
// Stores only integers. Does not read IP, cookies, or identity, and does not
// keep the user agent or Referer after classification.
//
// The shipped homepage is a mailto: CTA and does not post /i/mail, so mail_cta
// stays zero until a future ping or href is added. That is an unknowable, not
// a zero of human intent.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { classifyRequest, refererHost } from "./classify.js";

export const MAX_DAYS = 90;
export const MAX_SERIALIZED_BYTES = 64 * 1024;
export const BUCKETS = Object.freeze([
  "crawler_fetch",
  "machine_click_through",
  "mail_cta",
  "ordinary_view",
  "agent_fetch",
  "unresolved",
]);

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Tight machine-surface hosts. bing.com and openai.com are excluded on purpose:
// organic Bing search and platform docs are not a ChatGPT or Copilot click-through.
const MACHINE_SURFACES = [
  ["chatgpt.com", /(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/i],
  ["perplexity.ai", /(^|\.)perplexity\.ai$/i],
  ["claude.ai", /(^|\.)claude\.ai$/i],
  ["gemini.google.com", /(^|\.)gemini\.google\.com$|(^|\.)bard\.google\.com$/i],
  ["copilot.microsoft.com", /(^|\.)copilot\.microsoft\.com$/i],
  ["grok.com", /(^|\.)grok\.com$/i],
];

export const LEGEND = Object.freeze({
  crawler_fetch: {
    status: "measured",
    of: "GET /",
    how: "Declared crawler user-agent class A. The user agent is discarded after classification.",
  },
  machine_click_through: {
    status: "measured",
    of: "GET /",
    how: "Browser user agent plus a tight AI-surface Referer. Referer is discarded. bing.com and openai.com are not machine surfaces.",
  },
  agent_fetch: {
    status: "measured",
    of: "GET /",
    how: "Same-session agent user agent (ChatGPT-User, Claude-User, curl, and similar). Not a click-through.",
  },
  ordinary_view: {
    status: "inferred",
    of: "GET /",
    how: "Looks like a browser and has no tight AI-surface Referer. Direct visits, organic search, and stripped-referer AI clicks land here. Not proven human.",
  },
  mail_cta: {
    status: "measured-if-posted",
    of: "POST /i/mail",
    how: "Counts only this intent POST. The shipped homepage uses mailto:contact@samedaydesk.com and does not post here.",
  },
  unresolved: {
    status: "measured",
    of: "GET /",
    how: "Not a declared crawler, agent user, or browser. Empty user agents land here, never in ordinary_view.",
  },
});

function emptyCounts() {
  return {
    crawler_fetch: 0,
    machine_click_through: 0,
    mail_cta: 0,
    ordinary_view: 0,
    agent_fetch: 0,
    unresolved: 0,
  };
}

export function machineSurfaceHost(host) {
  if (!host) return null;
  for (const [name, re] of MACHINE_SURFACES) if (re.test(host)) return name;
  return null;
}

export function classifyHomeView({ ua, referer } = {}) {
  const { cls } = classifyRequest({ ua, referer });
  if (cls === "A") return "crawler_fetch";
  if (cls === "B") return "agent_fetch";
  if (cls === "E") return "unresolved";
  // Browser (class C or D). Do not inherit classify.js treating bing.com as AI.
  const host = refererHost(referer);
  if (machineSurfaceHost(host)) return "machine_click_through";
  return "ordinary_view";
}

function defaultFile() {
  const envFile = process.env.HOMEPAGE_MEASURE_FILE;
  if (envFile && envFile.length) return envFile;
  return path.join(os.tmpdir(), "sdd-home-measure-v1.json");
}

function sanitizeDay(counts) {
  const clean = emptyCounts();
  if (!counts || typeof counts !== "object") return clean;
  for (const key of BUCKETS) {
    const n = counts[key];
    clean[key] = Number.isInteger(n) && n >= 0 && n <= Number.MAX_SAFE_INTEGER ? n : 0;
  }
  return clean;
}

export function createHomeMeasure(opts = {}) {
  const maxDays = opts.maxDays ?? MAX_DAYS;
  const file = opts.file ?? defaultFile();
  const now = opts.now ?? (() => new Date());
  const memoryOnly = file === ":memory:";
  let days = Object.create(null);

  function utcDay(d = now()) {
    return new Date(d).toISOString().slice(0, 10);
  }

  function prune() {
    const keys = Object.keys(days).sort();
    while (keys.length > maxDays) delete days[keys.shift()];
  }

  function persist() {
    if (memoryOnly) return;
    const payload = JSON.stringify({ v: 1, days });
    if (Buffer.byteLength(payload) > MAX_SERIALIZED_BYTES) return;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, payload, { mode: 0o600 });
      fs.renameSync(tmp, file);
    } catch {
      /* Hostinger tmp is best-effort. Memory still holds the window. */
    }
  }

  function load() {
    if (memoryOnly) return;
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      const incoming = raw && raw.days && typeof raw.days === "object" ? raw.days : {};
      days = Object.create(null);
      for (const [day, counts] of Object.entries(incoming)) {
        if (!DAY_RE.test(day)) continue;
        days[day] = sanitizeDay(counts);
      }
      prune();
    } catch {
      days = Object.create(null);
    }
  }

  function bump(name) {
    if (!BUCKETS.includes(name)) return;
    const day = utcDay();
    if (!DAY_RE.test(day)) return;
    if (!days[day]) days[day] = emptyCounts();
    prune();
    if (!days[day]) days[day] = emptyCounts();
    const next = days[day][name] + 1;
    days[day][name] = next > Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : next;
    persist();
  }

  function recordView(req) {
    try {
      if (!req || req.method !== "GET") return;
      const p = String(req.path || "/").split("?")[0];
      if (p !== "/") return;
      const headers = req.headers || {};
      const purpose = String(headers.purpose || headers["sec-purpose"] || "");
      if (/prefetch|prerender/i.test(purpose)) return;
      bump(classifyHomeView({ ua: headers["user-agent"], referer: headers.referer || headers.referrer }));
    } catch {
      /* never break a page */
    }
  }

  function recordMail(req) {
    try {
      if (req && req.method && req.method !== "POST") return;
      bump("mail_cta");
    } catch {
      /* never break the intent route */
    }
  }

  function snapshot() {
    prune();
    const totals = emptyCounts();
    const outDays = {};
    for (const day of Object.keys(days).sort()) {
      outDays[day] = { ...days[day] };
      for (const key of BUCKETS) totals[key] += days[day][key];
    }
    return {
      v: 1,
      generated_at: now().toISOString(),
      window_days: maxDays,
      totals,
      days: outDays,
      legend: LEGEND,
    };
  }

  function serializedBytes() {
    return Buffer.byteLength(JSON.stringify({ v: 1, days }));
  }

  function middleware(req, _res, next) {
    recordView(req);
    next();
  }

  function mailIntent(req, res) {
    recordMail(req);
    res.setHeader("Cache-Control", "no-store");
    res.status(204).end();
  }

  load();
  return {
    recordView,
    recordMail,
    snapshot,
    persist,
    load,
    serializedBytes,
    middleware,
    mailIntent,
    file,
  };
}
