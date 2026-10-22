import { refuse } from "./errors.mjs";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export function assertLoopbackCallbackUrl(raw) {
  if (typeof raw !== "string" || !raw.trim()) {
    refuse("callback-url-required", "Operator must supply a loopback test receiver URL");
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    refuse("callback-url-invalid", "callback URL is not a valid URL", { url: raw });
  }
  if (url.protocol !== "http:") {
    refuse("callback-url-not-loopback", "Only http:// loopback receivers are allowed (no production webhook)", {
      protocol: url.protocol,
    });
  }
  if (url.username || url.password) {
    refuse("callback-url-secrets", "Callback URL must not contain userinfo or bearer secrets");
  }
  const host = url.hostname.replace(/^\[/, "").replace(/\]$/, "");
  if (!LOOPBACK_HOSTS.has(host)) {
    refuse("callback-url-not-loopback", "Callback host must be 127.0.0.1, localhost, or ::1", {
      hostname: url.hostname,
    });
  }
  const q = url.search.toLowerCase();
  if (/(token|bearer|secret|password|apikey|api_key)=/.test(q)) {
    refuse("callback-url-secrets", "Callback query must not carry bearer secrets");
  }
  return url;
}

export function callbackOrigin(raw) {
  const url = typeof raw === "string" ? assertLoopbackCallbackUrl(raw) : raw;
  const host = url.hostname.includes(":") && !url.hostname.startsWith("[") ? `[${url.hostname}]` : url.hostname;
  return `http://${host}:${url.port || "80"}`;
}
