// Pure parsers. They never treat a wrong shape as a partial success.

import { CODES } from "./codes.mjs";

export const SUPPORTED_PROTOCOL_VERSIONS = Object.freeze([
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
]);

export const APEX_SERVER_NAME = "samedaydesk-agent-tools";
export const GATEWAY_SERVER_NAME = "x402-data-gateway";
export const APEX_ORIGIN = "https://samedaydesk.com";
export const GATEWAY_ORIGIN = "https://agents.samedaydesk.com";
export const GATEWAY_HOST = "agents.samedaydesk.com";

export function header(entry, name) {
  const headers = entry?.headers || {};
  const want = String(name).toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === want) return String(value);
  }
  return "";
}

export function contentType(entry) {
  return header(entry, "content-type").toLowerCase();
}

export function bodyText(entry) {
  if (entry == null || entry.body == null) return "";
  if (typeof entry.body === "string") return entry.body;
  return JSON.stringify(entry.body);
}

export function isHtml(entry) {
  const type = contentType(entry);
  if (type.includes("text/html") || type.includes("application/xhtml")) return true;
  const text = bodyText(entry).trim().slice(0, 80).toLowerCase();
  return text.startsWith("<!doctype html") || text.startsWith("<html");
}

export function statusOf(entry) {
  return Number(entry?.status);
}

export function presented(entry) {
  const status = statusOf(entry);
  return status >= 200 && status < 300;
}

export function absent(entry) {
  if (!entry || entry.unobserved) return false;
  if (entry.status == null) return true;
  const status = statusOf(entry);
  return status === 404 || status === 410;
}

export function isRedirect(entry) {
  const status = statusOf(entry);
  return status >= 300 && status < 400;
}

export function hostOf(value) {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return "";
  }
}

export function parseJsonValue(entry) {
  if (!entry || entry.body == null) return { ok: false };
  if (typeof entry.body === "object") return { ok: true, value: entry.body };
  const text = String(entry.body).trim();
  if (!text) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

export function parseRpc(entry, notJsonCode) {
  if (!entry || entry.body == null || isHtml(entry)) return { ok: false, code: notJsonCode };
  const type = contentType(entry);
  if (typeof entry.body === "object") {
    return { ok: true, value: entry.body };
  }
  const text = String(entry.body);
  if (type.includes("text/event-stream") || /(^|\n)data:\s*\{/.test(text)) {
    const line = text.split(/\r?\n/).find((row) => row.startsWith("data:"));
    if (!line) return { ok: false, code: notJsonCode };
    try {
      return { ok: true, value: JSON.parse(line.slice(5).trim()) };
    } catch {
      return { ok: false, code: notJsonCode };
    }
  }
  if (type && !type.includes("json") && !text.trim().startsWith("{") && !text.trim().startsWith("[")) {
    return { ok: false, code: notJsonCode };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, code: notJsonCode };
  }
}

export function discoveryName(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  if (typeof value.name === "string" && value.name.trim()) return value.name.trim();
  if (typeof value.serverInfo?.name === "string") return value.serverInfo.name.trim();
  return "";
}

export function atomicAmount(value) {
  return typeof value === "string" && /^[1-9][0-9]*$/.test(value);
}

export function toolShapeOk(tool) {
  if (!tool || typeof tool !== "object" || Array.isArray(tool)) return false;
  if (typeof tool.name !== "string" || !tool.name.trim()) return false;
  if (typeof tool.description !== "string" || !tool.description.trim()) return false;
  if (!tool.inputSchema || typeof tool.inputSchema !== "object" || Array.isArray(tool.inputSchema)) return false;
  return true;
}

export function cardInterfaceUrl(card) {
  if (!card || typeof card !== "object" || Array.isArray(card)) return "";
  if (typeof card.url === "string" && card.url) return card.url;
  const interfaces = card.supportedInterfaces;
  if (Array.isArray(interfaces) && interfaces[0] && typeof interfaces[0].url === "string") return interfaces[0].url;
  return "";
}

export function cardShapeOk(card) {
  if (!card || typeof card !== "object" || Array.isArray(card)) return false;
  if (typeof card.name !== "string" || !card.name.trim()) return false;
  if (typeof card.description !== "string" || !card.description.trim()) return false;
  if (typeof card.version !== "string" || !card.version.trim()) return false;
  if (!Array.isArray(card.skills) || card.skills.length === 0) return false;
  for (const skill of card.skills) {
    if (!skill || typeof skill !== "object" || Array.isArray(skill)) return false;
    if (typeof skill.id !== "string" || !skill.id.trim()) return false;
    if (typeof skill.name !== "string" || !skill.name.trim()) return false;
  }
  return Boolean(cardInterfaceUrl(card));
}

export const RPC_INIT_ID = 1;
export const RPC_TOOLS_ID = 2;

export { CODES };
