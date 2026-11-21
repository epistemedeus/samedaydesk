// The release measurement contract. Diagnostic UI signals remain in journey-events.js.
// These five events describe server-observed commerce, never money authority.
import { randomUUID } from "node:crypto";
import pg from "pg";
import { isSupabaseConfigured, supabaseAdmin } from "./supabase-admin.js";
import { careDatabaseOptions } from "./care-store.js";

const events = new Set(["visit", "checkout_started", "payment_verified", "receipt_sent", "return"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let previewPool;

async function insert(row) {
  // Preview records use only the explicitly isolated Care database. Never fall through
  // to an ambient production Supabase connection during a private test.
  if (process.env.SDS_PRIVATE_PREVIEW === "1") {
    if (!process.env.SDS_CARE_DATABASE_URL) return false;
    previewPool ??= new pg.Pool({ ...careDatabaseOptions(), max: 1,
      connectionTimeoutMillis: 2000, idleTimeoutMillis: 1000, allowExitOnIdle: true });
    await previewPool.query(`insert into public.journey_events
      (event_key,brand,event,session_id,test,order_id,is_agent,referrer,utm)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (event_key) do nothing`,
    [row.event_key, row.brand, row.event, row.session_id, row.test, row.order_id, row.is_agent, row.referrer, row.utm]);
  } else {
    if (!isSupabaseConfigured()) return false;
    const { error } = await supabaseAdmin().from("journey_events")
      .upsert(row, { onConflict: "event_key", ignoreDuplicates: true });
    if (error) throw error;
  }
  return true;
}

export async function recordCommerceJourney(event, facts, write = insert) {
  if (!events.has(event) || !uuid.test(facts.sessionId || "") ||
      typeof facts.key !== "string" || !/^[a-zA-Z0-9_:/.-]{1,200}$/.test(facts.key)) return false;
  const row = {
    event_key: `samedaydesk/${event}/${facts.key}`, brand: "samedaydesk", event,
    session_id: facts.sessionId, test: process.env.SDS_PRIVATE_PREVIEW === "1" || facts.live === false,
    order_id: typeof facts.orderId === "string" ? facts.orderId.slice(0, 180) : null,
    is_agent: facts.agent === true, referrer: facts.referrer || null, utm: facts.utm || {},
  };
  try { return await write(row); }
  catch {
    // A measurement outage must not reverse a paid order or claim successful reception.
    console.error("[journey] commerce event was not stored", event);
    return false;
  }
}

export async function commerceVisit(req, res, next) {
  const cookie = /(?:^|;\s*)sds_session=([^;]+)/.exec(req.headers.cookie || "")?.[1];
  const sessionId = uuid.test(cookie || "") ? cookie : randomUUID();
  req.journeySession = sessionId;
  const machine = /^\/(?:start\.md|llms\.txt|mcp|\.well-known\/)/.test(req.path);
  const page = req.method === "GET" && (machine || !req.path.startsWith("/api/") &&
    (!/\.[a-z0-9]+$/i.test(req.path) || /\.html$/i.test(req.path)));
  if (page) {
    if (!cookie || !uuid.test(cookie)) res.cookie("sds_session", sessionId,
      { httpOnly: true, sameSite: "lax", secure: process.env.SDS_PRIVATE_PREVIEW !== "1", maxAge: 30 * 60_000 });
    let referrer = null;
    try { referrer = new URL(req.headers.referer).origin; } catch { /* absent or invalid */ }
    const utm = Object.fromEntries(["utm_source", "utm_medium", "utm_campaign"]
      .filter((key) => typeof req.query[key] === "string" && /^[a-zA-Z0-9_.-]{1,96}$/.test(req.query[key]))
      .map((key) => [key, req.query[key]]));
    // Wait for the observation before finishing this request; a passing response
    // cannot stand in for a still-pending write during preview readback.
    await recordCommerceJourney("visit", { sessionId, key: sessionId, referrer, utm,
      agent: machine || /bot|crawler|spider|chatgpt|claude|gptbot/i.test(req.headers["user-agent"] || "") });
  }
  next();
}
