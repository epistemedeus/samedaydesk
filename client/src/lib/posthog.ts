// Cookieless, privacy-light analytics. Dynamically imported so posthog-js never
// weighs down the critical landing bundle, so it loads only when a key is set.
type PH = typeof import("posthog-js").default;

let ph: PH | null = null;
let loading: Promise<void> | null = null;
const pendingEvents: Array<{ event: string; props?: Record<string, unknown> }> = [];
const FIRST_PARTY_EVENTS = new Set([
  "seller_repair_brief_viewed",
  "seller_repair_scope_clicked",
  "seller_repair_checkout_started",
]);

function captureFirstParty(event: string, props?: Record<string, unknown>) {
  if (!FIRST_PARTY_EVENTS.has(event) || typeof window === "undefined") return;
  void fetch("/api/pulse/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, props }),
    keepalive: true,
  }).catch(() => undefined);
}

export function initAnalytics() {
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  if (!key || loading) return;
  loading = import("posthog-js").then(({ default: posthog }) => {
    posthog.init(key, {
      api_host: (import.meta.env.VITE_POSTHOG_HOST as string) || "https://us.i.posthog.com",
      persistence: "memory", // cookieless, no consent banner needed
      person_profiles: "identified_only",
      capture_pageview: true,
      autocapture: false,
      disable_session_recording: true,
    });
    ph = posthog;
    pendingEvents.splice(0).forEach(({ event, props }) => posthog.capture(event, props));
  });
}

// Buffer early route events while the lazy analytics bundle loads. This matters
// for direct landings, where child effects can fire before App initializes PostHog.
export function track(event: string, props?: Record<string, unknown>) {
  captureFirstParty(event, props);
  if (ph) {
    ph.capture(event, props);
    return;
  }

  // If analytics is disabled, do not build an unbounded in-memory queue. One
  // route load plus a few CTA clicks is enough to preserve the useful funnel.
  if (pendingEvents.length < 20) pendingEvents.push({ event, props });
}
