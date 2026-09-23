import { DENIED_GATEWAY_HOSTS } from "./catalog.mjs";

function hostnameOf(url) {
  return String(url.hostname || "").replace(/^\[|\]$/g, "").toLowerCase();
}

export function isLoopbackHost(hostname) {
  const host = String(hostname || "").replace(/^\[|\]$/g, "").toLowerCase();
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

// No remote client. Gateway hosts are refused before any socket is opened.
export function originDecision(input) {
  if (input == null || input === "") return { allow: true, kind: "shipped" };
  let url;
  try {
    url = new URL(input);
  } catch {
    return { allow: false, code: "USAGE", message: "origin is not a URL" };
  }
  const host = hostnameOf(url);
  if (DENIED_GATEWAY_HOSTS.includes(host)) {
    return {
      allow: false,
      code: "GATEWAY_CLIENT_REFUSE",
      message: "refusing gateway host; this verifier is not a gateway client",
    };
  }
  if (!isLoopbackHost(host)) {
    return {
      allow: false,
      code: "REMOTE_CLIENT_REFUSE",
      message: "refusing non-loopback origin; apex proof uses the shipped server, not a remote client",
    };
  }
  if (url.protocol !== "http:") {
    return { allow: false, code: "USAGE", message: "loopback origin must be http" };
  }
  return { allow: true, kind: "origin", origin: url.origin, href: url.href };
}
