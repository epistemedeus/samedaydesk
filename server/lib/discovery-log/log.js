// AE21 J9-LOG: privacy-limited, append-only per-request discovery log (stage 1 of the joint journey spec,
// pilot codex/ae21-journey-economics@93eb82eb JOIN-SPEC.md, amended by pilot codex/ae21-journey-discovery-join AMENDMENTS.md).
// Records only: route, method class, declared source label, verbatim `source` query, verbatim referrer (withheld if it carries
// a query/fragment/userinfo), an opaque journey-token digest, and an observed agent class. No IP, no raw UA, no body, no cookies.
// Verified owner-qa requests are never written. Logging never changes a response; sink errors are counted, not thrown.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const SCHEMA = "samedaydesk.discovery-log.v1";
export const ROUTES = new Map([
  ["POST /mcp", "mcp"], ["GET /llms.txt", "llms"], ["GET /llms-full.txt", "llms"],
  ["GET /.well-known/agent-card.json", "agent-card"], ["GET /.well-known/mcp/server.json", "mcp-descriptor"],
]);
// Same closed vocabulary as x402-url-extractor commerce-events.mjs:127-135 + AE21 patch 0001.
export const DECLARED = new Map([
  ["agent-skills-v1", "agent-skills"], ["agentictrade-v1", "agentictrade"], ["agentverse-a2a-v1", "agentverse"],
  ["aws-agentcore-v1", "aws-agentcore"], ["agentcash-v1", "agentcash"], ["claude-code-marketplace-v1", "claude-code-marketplace"],
  ["goose-native-v1", "goose-native"], ["llms-txt-v1", "llms-txt"], ["ae-surface-v1", "ae-surface"],
]);
const OBSERVED = [["claude", /claude|anthropic/i], ["openai", /openai|chatgpt|gptbot/i], ["goose", /goose/i], ["cursor", /cursor/i], ["generic-bot", /bot|crawler|spider/i]];
const SAFE_TEXT = /^[\x21-\x7e]{1,256}$/; // printable ASCII, no spaces/control chars
const TOKEN = /^[A-Za-z0-9._~-]{16,128}$/;
const MAX_LINE = 2048;

const hmac = (secret, domain, value) => crypto.createHmac("sha256", secret).update(domain + "\0" + value).digest("hex");

export function qaProof(secret, marker) { return hmac(secret, "samedaydesk.discovery-log.owner-qa.v1", marker); }

/** owner-qa: verified header pair => "owner-qa" (excluded). A claim that does not verify => "unverified-qa" (kept, never independent). */
export function qaStatus(headers, secret) {
  const marker = headers["x-samedaydesk-owner-qa"], proof = headers["x-samedaydesk-owner-qa-proof"];
  if (marker === undefined && proof === undefined && !/owner-qa/i.test(String(headers["user-agent"] || ""))) return "none";
  if (secret && typeof marker === "string" && TOKEN.test(marker) && typeof proof === "string"
    && proof.length === 64 && crypto.timingSafeEqual(Buffer.from(proof), Buffer.from(qaProof(secret, marker)))) return "owner-qa";
  return "unverified-qa";
}

export function buildRecord(req, { now = () => new Date(), secret = "", journeySecret = "" } = {}) {
  const key = `${req.method} ${String(req.path || "").replace(/\/+$/, "") || "/"}`;
  const surface = ROUTES.get(key);
  if (!surface) return { skip: "route" };
  const h = req.headers || {};
  const qa = qaStatus(h, secret);
  if (qa === "owner-qa") return { skip: "owner-qa" };
  const declaredRaw = typeof h["x-samedaydesk-agent-source"] === "string" ? h["x-samedaydesk-agent-source"] : null;
  const declared = declaredRaw !== null ? (DECLARED.get(declaredRaw) ?? null) : null;
  const src = req.query && typeof req.query.source === "string" ? req.query.source : null;
  const discoveryRef = src !== null && SAFE_TEXT.test(src) ? src : null;
  let discoveryReferrer = null, referrerWithheld = null;
  const ref = typeof h.referer === "string" ? h.referer : null;
  if (ref !== null) {
    let u = null; try { u = new URL(ref); } catch { /* invalid */ }
    if (!u || !/^https?:$/.test(u.protocol)) referrerWithheld = "invalid";
    else if (u.search || u.hash || u.username || u.password) referrerWithheld = "query-or-credentials";
    else if (ref.length > 512) referrerWithheld = "length";
    else discoveryReferrer = ref; // verbatim, never normalised
  }
  const tok = h["x-samedaydesk-journey"];
  const journeyDigest = typeof journeySecret === "string" && journeySecret.length >= 32 && typeof tok === "string" && TOKEN.test(tok) ? "hmac-sha256:" + hmac(journeySecret, "samedaydesk.journey-token.v1", tok) : null;
  const ua = String(h["user-agent"] || "");
  const observed = (OBSERVED.find(([, re]) => re.test(ua)) || [null])[0];
  const mcpMethod = surface === "mcp" && req.body && typeof req.body.method === "string" && /^[a-z/_]{1,40}$/.test(req.body.method) ? req.body.method : null;
  const record = {
    schema: SCHEMA, stage: "discovery", ts: now().toISOString(), requestId: crypto.randomUUID(), surface, route: key, mcpMethod,
    requesterId: null, // the payer is unknown at discovery; joins use journeyDigest to the gateway's paid event (spec S-J)
    callerClass: qa === "unverified-qa" ? "unknown" : "unknown", qaClaimUnverified: qa === "unverified-qa",
    declaredSource: declared, declaredSourceDropped: declaredRaw !== null && declared === null,
    discoveryRef, discoveryRefWithheld: src !== null && discoveryRef === null,
    discoveryReferrer, referrerWithheld, journeyDigest, observedAgentClass: observed, usefulKind: null,
  };
  return { record };
}

/** Append-only daily NDJSON sink: O_APPEND, 0600, one line per record, never read back or rewritten here. */
export function fileSink(dir) {
  return (record) => {
    const line = JSON.stringify(record);
    if (Buffer.byteLength(line) + 1 > MAX_LINE) throw new Error("DISCOVERY-LOG-LINE-TOO-LONG");
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.appendFileSync(path.join(dir, `discovery-${record.ts.slice(0, 10)}.ndjson`), line + "\n", { flag: "a", mode: 0o600 });
  };
}

export function discoveryLogMiddleware({ sink, now, secret = process.env.DISCOVERY_LOG_QA_SECRET || "", journeySecret = process.env.DISCOVERY_LOG_JOURNEY_SECRET || "", counters = { written: 0, skipped: 0, errors: 0 } } = {}) {
  const mw = (req, _res, next) => {
    try {
      const r = buildRecord(req, { now, secret, journeySecret });
      if (r.skip) { if (r.skip === "owner-qa") counters.skipped += 1; }
      else if (sink) { sink(r.record); counters.written += 1; }
    } catch { counters.errors += 1; }
    next();
  };
  mw.counters = counters;
  return mw;
}
