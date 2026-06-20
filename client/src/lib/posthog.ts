// Cookieless, privacy-light analytics. Dynamically imported so posthog-js never
// weighs down the critical landing bundle — it loads only when a key is set.
type PH = typeof import("posthog-js").default;

let ph: PH | null = null;
let loading: Promise<void> | null = null;

export function initAnalytics() {
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  if (!key || loading) return;
  loading = import("posthog-js").then(({ default: posthog }) => {
    posthog.init(key, {
      api_host: (import.meta.env.VITE_POSTHOG_HOST as string) || "https://us.i.posthog.com",
      persistence: "memory", // cookieless — no consent banner needed
      person_profiles: "identified_only",
      capture_pageview: true,
      autocapture: false,
      disable_session_recording: true,
    });
    ph = posthog;
  });
}

// ~5 funnel events. No-ops until analytics is configured + loaded.
export function track(event: string, props?: Record<string, unknown>) {
  if (ph) ph.capture(event, props);
}
