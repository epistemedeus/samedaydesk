// Abuse bounds for the free answer panel. Every model call costs money, and the form is
// ungated on purpose, so the bounds have to be invisible to an honest owner of one domain
// and boring for everyone else.
//
// Pure functions first so the rules can be tested without a database.
import { supabaseAdmin, isSupabaseConfigured } from "./supabase-admin.js";
import crypto from "node:crypto";

export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_DOMAINS_PER_IP_PER_DAY = 5;
export const MAX_LIVE_RUNS_PER_DOMAIN_PER_DAY = 1;

// example.co.uk and www.example.co.uk are the same site to a buyer, so they are one key.
const TWO_PART_TLDS = new Set(["co.uk", "org.uk", "ac.uk", "gov.uk", "co.nz", "co.za", "com.au", "com.br", "co.jp", "co.in", "com.mx"]);

export function registrableDomain(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return host;
  const lastTwo = parts.slice(-2).join(".");
  return TWO_PART_TLDS.has(lastTwo) ? parts.slice(-3).join(".") : lastTwo;
}

export function ipHash(ip) {
  return crypto.createHash("sha256").update(`sdd-report|${ip || ""}`).digest("hex").slice(0, 32);
}

export function todayIso(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function isFresh(createdAt, now = new Date()) {
  if (!createdAt) return false;
  return now.getTime() - new Date(createdAt).getTime() < CACHE_TTL_MS;
}

// Decide from counts alone, so the rule is testable without a database.
export function decideFromCounts({ cachedPayload, cacheCreatedAt, domainRunsToday, distinctDomainsForIpToday, budgetSpentCents, budgetCapCents, now = new Date() }) {
  if (cachedPayload && isFresh(cacheCreatedAt, now)) {
    return { mode: "cache", reason: "A live run for this domain already happened today. This is that result, with its own timestamp." };
  }
  if (budgetCapCents != null && budgetSpentCents >= budgetCapCents) {
    return { mode: "eligibility_only", reason: "The daily budget for live answer checks is spent. The checks above still ran." };
  }
  if (domainRunsToday >= MAX_LIVE_RUNS_PER_DOMAIN_PER_DAY) {
    return { mode: "eligibility_only", reason: "This domain already had its live answer check today. Try again tomorrow, or read the stored copy." };
  }
  if (distinctDomainsForIpToday >= MAX_DOMAINS_PER_IP_PER_DAY) {
    return { mode: "eligibility_only", reason: "That is five different domains from one place today. The checks above still ran; the answer panel resumes tomorrow." };
  }
  return { mode: "live", reason: null };
}

// Storage-backed wrapper. Any failure closes the panel for this request rather than
// spending money it cannot account for.
export async function checkBounds({ domain, ip, budgetCapCents }) {
  if (!isSupabaseConfigured()) {
    return { mode: "eligibility_only", reason: "Live answer checks are not switched on for this deployment. The checks above still ran.", storage: false };
  }
  try {
    const sb = supabaseAdmin();
    const day = todayIso();
    const hash = ipHash(ip);
    const [{ data: cached }, { data: quotaRows }] = await Promise.all([
      sb.from("report_cache").select("payload, created_at").eq("registrable_domain", domain).maybeSingle(),
      sb.from("report_quota").select("registrable_domain, ip_hash, count").eq("day", day),
    ]);
    const rows = quotaRows || [];
    const domainRunsToday = rows.filter((r) => r.registrable_domain === domain).reduce((n, r) => n + (r.count || 0), 0);
    const distinctDomainsForIpToday = new Set(rows.filter((r) => r.ip_hash === hash).map((r) => r.registrable_domain)).size;
    const budgetSpentCents = rows.reduce((n, r) => n + (r.count || 0), 0);
    const decision = decideFromCounts({
      cachedPayload: cached?.payload,
      cacheCreatedAt: cached?.created_at,
      domainRunsToday,
      distinctDomainsForIpToday,
      budgetSpentCents,
      budgetCapCents,
    });
    return { ...decision, payload: cached?.payload, cachedAt: cached?.created_at, storage: true };
  } catch (e) {
    console.error("[report-bounds] check failed", e?.message);
    return { mode: "eligibility_only", reason: "The bookkeeping for live answer checks is unavailable right now, so this run is checks only.", storage: false };
  }
}

export async function recordRun({ domain, ip, payload }) {
  if (!isSupabaseConfigured()) return;
  const day = todayIso();
  const hash = ipHash(ip);
  try {
    const sb = supabaseAdmin();
    await sb.from("report_cache").upsert({ registrable_domain: domain, payload, created_at: new Date().toISOString() }, { onConflict: "registrable_domain" });
    const { data: existing } = await sb.from("report_quota").select("count").eq("day", day).eq("registrable_domain", domain).eq("ip_hash", hash).maybeSingle();
    await sb.from("report_quota").upsert({ day, registrable_domain: domain, ip_hash: hash, count: (existing?.count || 0) + 1 }, { onConflict: "day,registrable_domain,ip_hash" });
  } catch (e) {
    console.error("[report-bounds] record failed", e?.message);
  }
}
