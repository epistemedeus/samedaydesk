// Server-side events. PostHog when a key is present, a log line when it is not, and never
// an exception into the request path. Names are fixed: report_requested,
// report_eligibility_ready, report_delivered, report_email_opt_in, audit_checkout_started,
// audit_paid.
const KEY = process.env.POSTHOG_KEY || process.env.VITE_POSTHOG_KEY || "";
const HOST = process.env.POSTHOG_HOST || "https://us.i.posthog.com";

const counts = new Map();

export function capture(event, properties = {}) {
  counts.set(event, (counts.get(event) || 0) + 1);
  const payload = { event, properties: { ...properties, $lib: "samedaydesk-server" }, timestamp: new Date().toISOString() };
  if (!KEY) {
    console.log(`[event] ${event} ${JSON.stringify(properties)}`);
    return Promise.resolve({ sent: false });
  }
  return fetch(`${HOST}/i/v0/e/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: KEY, distinct_id: properties.domain || "server", ...payload }),
  })
    .then(() => ({ sent: true }))
    .catch((e) => {
      console.error("[event] send failed", e?.message);
      return { sent: false };
    });
}

// Process-local counters, so /api/metrics can answer even with no analytics backend.
export function eventCounts() {
  return Object.fromEntries(counts);
}
