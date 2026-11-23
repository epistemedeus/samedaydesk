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

export function sendTraffic(context: { path: string; scriptRan: true; interacted: boolean }) {
  void fetch('/api/pulse/traffic', { method: 'POST', credentials: 'same-origin', keepalive: true,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(context) }).catch(() => undefined);
}
