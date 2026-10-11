import ipaddr from "ipaddr.js";

const BLOCKED_NAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.google.com",
]);

export class PublicHostError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = "PublicHostError";
    this.code = code;
  }
}

export function addressBlocked(ip) {
  let addr;
  try {
    addr = ipaddr.parse(String(ip).trim());
  } catch {
    return true;
  }
  if (addr.kind() === "ipv6" && addr.isIPv4MappedAddress()) addr = addr.toIPv4Address();
  return addr.range() !== "unicast";
}

export function hostnameBlocked(hostname) {
  const host = String(hostname || "").trim().replace(/\.$/, "").toLowerCase();
  if (!host || host.includes(" ") || host.includes("@")) return true;
  if (BLOCKED_NAMES.has(host)) return true;
  if (host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return true;
  if (host.includes(":")) {
    const bare = host.replace(/^\[|\]$/g, "");
    if (ipaddr.isValid(bare)) return addressBlocked(bare);
    return true;
  }
  if (ipaddr.isValid(host)) return addressBlocked(host);
  return false;
}

export function assertPublicUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new PublicHostError("url_unusable", "URL is not usable");
  }
  if (url.username || url.password) throw new PublicHostError("credentials_refused", "Credentials are not allowed");
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new PublicHostError("protocol_refused", "Only http(s) URLs are supported");
  }
  if (hostnameBlocked(url.hostname)) throw new PublicHostError("host_refused", "That host is not a public address");
  return url;
}
