import { observeTraffic } from "./traffic-browser.mjs";
export function journey(event: string, props: { offer?: string; state?: string } = {}) {
  void fetch("/api/pulse/journey", { method: "POST", keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, props: { ...props, path: window.location.pathname } }),
  }).catch(() => undefined);
}

export function observeBrowserErrors() {
  const receive = () => { void fetch("/api/pulse/error", { method: "POST", keepalive: true,
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: "browser_runtime" }),
  }).catch(() => undefined); };
  window.addEventListener("error", receive);
  window.addEventListener("unhandledrejection", receive);
  return () => { window.removeEventListener("error", receive); window.removeEventListener("unhandledrejection", receive); };
}

// Reuses the existing event route and cookie; only coarse observations leave the page.
export function observePageTraffic() {
  const query = new URLSearchParams(window.location.search);
  const utm = Object.fromEntries(['utm_source','utm_medium','utm_campaign'].map(k => [k, query.get(k)]));
  return observeTraffic(traffic => {
    void fetch('/api/pulse/journey', { method: 'POST', credentials: 'same-origin', keepalive: true,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'page_viewed',
        props: { path: traffic.path }, traffic, referrer: document.referrer, utm }) }).catch(() => undefined);
  });
}
