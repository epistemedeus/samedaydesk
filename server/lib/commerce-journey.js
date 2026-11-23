// The release measurement contract. Diagnostic UI signals remain in journey-events.js.
// These five events describe server-observed commerce, never money authority.
import { randomUUID, createHash } from "node:crypto";
import { isSupabaseConfigured, supabaseAdmin } from "./supabase-admin.js";
import { sharedCarePool, careTable } from "./care-database.js";

import { requestTraffic } from './traffic-ingress.mjs';
import { pagePath, trafficSchema } from './traffic-context.mjs';
const visitKey = (session, path) => `${session}/${createHash('sha256').update(path).digest('hex').slice(0, 32)}/${new Date().toISOString().slice(0, 10)}`;
const events = new Set(["visit", "checkout_started", "payment_verified", "receipt_sent", "return"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function insert(row) {
  const pool = sharedCarePool();
  if (pool) {
    if (!row.traffic && row.event !== 'visit') {
      const previous = await pool.query(`select traffic from ${careTable("journey_events")}
        where event='visit' and session_id=$1 and traffic->>'schema'='journey.traffic.v1'
        order by created_at desc limit 1`, [row.session_id]);
      row.traffic = previous.rows[0]?.traffic ?? null;
    }
    await pool.query(`insert into ${careTable("journey_events")}
      (event_key,brand,event,session_id,test,order_id,is_agent,referrer,utm,traffic)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (event_key) do update
      set traffic = journey_events.traffic || jsonb_build_object(
        'scriptRan', (journey_events.traffic->>'scriptRan')::boolean OR (excluded.traffic->>'scriptRan')::boolean,
        'interacted', (journey_events.traffic->>'interacted')::boolean OR (excluded.traffic->>'interacted')::boolean)
      where journey_events.event='visit' and journey_events.traffic->>'schema'='journey.traffic.v1'
        and excluded.traffic->>'schema'='journey.traffic.v1'
        and journey_events.test=excluded.test`,
    [row.event_key, row.brand, row.event, row.session_id, row.test, row.order_id, row.is_agent, row.referrer, row.utm, row.traffic]);
  } else {
    if (process.env.SDS_PRIVATE_PREVIEW === "1") return false;
    if (!isSupabaseConfigured()) return false;
    if (!row.traffic && row.event !== 'visit') {
      const { data, error } = await supabaseAdmin().from('journey_events').select('traffic')
        .eq('event', 'visit').eq('session_id', row.session_id).eq('traffic->>schema', trafficSchema)
        .order('created_at', { ascending: false }).limit(1);
      if (error) throw error;
      row.traffic = data?.[0]?.traffic ?? null;
    }
    const { error } = row.traffic
      ? await supabaseAdmin().rpc('record_journey_traffic', { observation: row })
      : await supabaseAdmin().from("journey_events").upsert(row, { onConflict: "event_key", ignoreDuplicates: true });
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
    traffic: facts.traffic?.schema === trafficSchema ? facts.traffic : null,
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
    await recordCommerceJourney("visit", { sessionId, key: visitKey(sessionId, req.path), referrer, utm, traffic: requestTraffic(req, req.path),
      agent: machine || /bot|crawler|spider|chatgpt|claude|gptbot/i.test(req.headers["user-agent"] || "") });
  }
  next();
}

// Browser observations join the existing cookie and page key; payment fields are never accepted.
export async function commerceBrowser(req, res) {
  res.set('Cache-Control', 'no-store');
  const body = req.body;
  if (!body || Object.keys(body).some(k => !['path','scriptRan','interacted'].includes(k)) ||
      body.scriptRan !== true || typeof body.interacted !== 'boolean' || !pagePath(body.path)) return res.sendStatus(400);
  if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin &&
      !['https://samedaydesk.com','https://www.samedaydesk.com'].includes(req.headers.origin) && !(process.env.SDS_PRIVATE_PREVIEW === '1' && req.headers.origin === `${req.protocol}://${req.get('host')}`))) return res.sendStatus(403);
  const cookie = /(?:^|;\s*)sds_session=([^;]+)/.exec(req.headers.cookie || '')?.[1];
  const sessionId = uuid.test(cookie || '') ? cookie : req.journeySession;
  if (!uuid.test(sessionId || '')) return res.sendStatus(409);
  if (!cookie) res.cookie('sds_session', sessionId,
    { httpOnly: true, sameSite: 'lax', secure: process.env.SDS_PRIVATE_PREVIEW !== '1', maxAge: 30 * 60_000 });
  const path = pagePath(body.path);
  const stored = await recordCommerceJourney('visit', { sessionId, key: visitKey(sessionId, path),
    traffic: requestTraffic(req, path, body) });
  return res.sendStatus(stored ? 204 : 503);
}
