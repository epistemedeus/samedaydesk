import posthog from "posthog-js";

let started = false;

// Cookieless, privacy-light analytics. ~5 funnel events, no autocapture.
export function initAnalytics() {
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  if (!key || started) return;
  started = true;
  posthog.init(key, {
    api_host: (import.meta.env.VITE_POSTHOG_HOST as string) || "https://us.i.posthog.com",
    persistence: "memory", // cookieless — no consent banner needed
    person_profiles: "identified_only",
    capture_pageview: true,
    autocapture: false,
    disable_session_recording: true,
  });
}

export function track(event: string, props?: Record<string, unknown>) {
  if (import.meta.env.VITE_POSTHOG_KEY && started) posthog.capture(event, props);
}
