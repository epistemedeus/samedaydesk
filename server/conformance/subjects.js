import { isIP } from "node:net";
import { assertPublicHostname } from "../lib/agent-readiness/ssrf.js";

const MCP_ID = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;
const MCP_ID_MAX = 100;
const HOST = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export function isMcpId(value) {
  const id = String(value || "");
  if (id.length < 1 || id.length > MCP_ID_MAX) return false;
  if (id.includes("..")) return false;
  return MCP_ID.test(id);
}

export function isMcpSubject(org, repo) {
  return isMcpId(org) && isMcpId(repo);
}

function canonicalHostname(host) {
  try {
    return new URL(`http://${host}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isX402Host(host) {
  const value = String(host || "").toLowerCase();
  if (!value || value.includes("/") || value.includes("\\") || value.includes("@") || value.includes(":") || value.includes(" ") || value.endsWith(".")) {
    return false;
  }
  if (!HOST.test(value)) return false;
  const canonical = canonicalHostname(value);
  if (!canonical) return false;
  if (isIP(value) || isIP(canonical)) return false;
  try {
    assertPublicHostname(value);
    if (canonical !== value) assertPublicHostname(canonical);
  } catch {
    return false;
  }
  return HOST.test(canonical);
}

export function publicHostFromOrigin(origin) {
  if (typeof origin !== "string" || !origin) return null;
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  const host = parsed.hostname.toLowerCase();
  if (!isX402Host(host)) return null;
  return host;
}

export function githubRepoFromUrl(url) {
  if (typeof url !== "string" || !url) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (host !== "github.com" && host !== "www.github.com") return null;
  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.some((part) => part === ".." || part === ".")) return null;
  if (parts.length < 2) return null;
  const org = parts[0];
  const repo = parts[1].replace(/\.git$/i, "");
  if (!isMcpSubject(org, repo)) return null;
  return { org, repo };
}
