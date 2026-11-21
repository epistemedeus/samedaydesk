import { appendFileSync, lstatSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

// Diagnostic observations only. This is never an order, payment ledger or demand
// projection. No URLs, identifiers, form values, exception text or capabilities.
const browserEvents = new Set(["page_viewed", "agent_dropdown_opened", "checkout_started", "checkout_failed",
  "sign_in_started", "sign_in_completed", "sign_in_failed", "form_sent", "form_failed", "receipt_opened"]);
const serverEvents = new Set(["payment_confirmed", "form_received", "request_error"]);
const offers = new Set(["agent_workflow", "agent_mcp_server", "agent_front_door", "machine_payment_route", "agent_storefront", "keep_it_working"]);
const states = new Set(["created", "paid", "expired", "refunded", "review", "intake", "task", "login", "signup", "care_request", "task_store", "browser_runtime"]);
const counts = Object.create(null);

export function journeyPath(value) {
  if (typeof value !== "string") return null;
  const path = value.split(/[?#]/, 1)[0];
  if (!/^\/[a-zA-Z0-9/_.-]{0,180}$/.test(path) || path.includes("..")) return null;
  if (path.startsWith("/receipts/")) return "/receipts/:id";
  if (path.startsWith("/scan/")) return "/scan/:id";
  return path;
}

export function recordJourney(event, props = {}, source = "browser", env = process.env) {
  if (!(source === "browser" ? browserEvents : source === "server" ? serverEvents : new Set()).has(event)) return false;
  const path = journeyPath(props.path);
  if (!path) return false;
  const row = { schema: "samedaydesk.journey.v1", at: new Date().toISOString(), event, source, path };
  if (offers.has(props.offer)) row.offer = props.offer;
  if (states.has(props.state)) row.state = props.state;
  const file = env.SDS_JOURNEY_EVENTS_PATH;
  try {
    if (file) {
      if (!isAbsolute(file) || resolve(file).startsWith(resolve("client") + "/")) return false;
      try { if (lstatSync(file).isSymbolicLink()) return false; } catch (error) { if (error.code !== "ENOENT") return false; }
      appendFileSync(file, JSON.stringify(row) + "\n", { mode: 0o600 });
    }
    counts[event] = (counts[event] || 0) + 1;
    return true;
  } catch { return false; }
}

export const journeySnapshot = () => ({ schema: "samedaydesk.journey-counts.v1", scope: "current_process", counts: { ...counts } });

// Prepared transport to the existing operator-selected tracker. Disabled without
// an endpoint; one bounded send, no replay after an unknown result.
export async function reportRequestError(state, env = process.env) {
  const row = { event: "request_error", state, path: "/api" };
  recordJourney(row.event, row, "server", env);
  if (!env.SDS_ERROR_TRACKER_URL) return { enabled: false };
  try {
    const url = new URL(env.SDS_ERROR_TRACKER_URL);
    if (url.protocol !== "https:" && !(env.SDS_PRIVATE_PREVIEW === "1" && url.hostname === "127.0.0.1")) return { enabled: true, received: false };
    const response = await fetch(url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(4000),
      headers: { "Content-Type": "application/json", ...(env.SDS_ERROR_TRACKER_TOKEN ? { Authorization: `Bearer ${env.SDS_ERROR_TRACKER_TOKEN}` } : {}) },
      body: JSON.stringify({ ...row, service: "samedaydesk", schema: "samedaydesk.error.v1" }) });
    return { enabled: true, received: response.ok };
  } catch { return { enabled: true, received: false }; }
}
