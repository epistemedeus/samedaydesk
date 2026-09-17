import { LIVE_ROUTES } from "./constants.mjs";
import { isPlainObject } from "./money.mjs";

function routeFromTemplate(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/")) return trimmed.split("?")[0];
  try {
    const url = new URL(trimmed);
    return url.pathname || null;
  } catch {
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  }
}

export function idFromRoute(route, explicitId) {
  if (typeof explicitId === "string" && explicitId.trim()) {
    const needle = explicitId.trim();
    for (const row of Object.values(LIVE_ROUTES)) {
      if (row.id === needle || row.aliases.includes(needle)) return row.id;
    }
    return needle;
  }
  const path = routeFromTemplate(route);
  if (!path) return null;
  for (const row of Object.values(LIVE_ROUTES)) {
    if (row.route === path || row.aliases.includes(path)) return row.id;
  }
  return path.replace(/^\//, "").replaceAll("/", "-");
}

function fromAccepts(item) {
  const accept = Array.isArray(item?.accepts) ? item.accepts[0] : item?.accepts;
  if (!isPlainObject(accept)) return {};
  return {
    amountAtomic: accept.amount != null ? String(accept.amount) : undefined,
    network: accept.network,
    asset: accept.asset,
    payTo: accept.payTo,
  };
}

function fromPriceBlock(item) {
  const price = item?.price;
  if (!isPlainObject(price)) return {};
  return {
    amountAtomic: price.amount != null ? String(price.amount) : undefined,
    amount: typeof price.display === "string" ? price.display.replace(/\s*USDC$/i, "").trim() : price.amountDisplay,
    network: price.network,
    asset: price.asset,
  };
}

export function normalizeRouteRow(raw) {
  if (!isPlainObject(raw)) return null;
  const accept = fromAccepts(raw);
  const price = fromPriceBlock(raw);
  const route =
    routeFromTemplate(raw.route) ||
    routeFromTemplate(raw.resource?.routeTemplate) ||
    routeFromTemplate(raw.resource?.url) ||
    routeFromTemplate(raw.url);
  const id = idFromRoute(route, raw.id || raw.tool);
  const amount =
    raw.amount != null
      ? raw.amount
      : price.amount != null
        ? price.amount
        : raw.amountDisplay;
  const amountAtomic =
    raw.amountAtomic != null
      ? raw.amountAtomic
      : accept.amountAtomic != null
        ? accept.amountAtomic
        : price.amountAtomic;
  return {
    id,
    route,
    method: raw.method || raw.request?.method || "GET",
    amount: amount == null ? undefined : amount,
    amountAtomic: amountAtomic == null ? undefined : amountAtomic,
    network: raw.network || accept.network || price.network,
    asset: raw.asset || accept.asset || price.asset,
    payTo: raw.payTo || accept.payTo,
    required: raw.required === true,
    proposed: raw.proposed === true || raw.newSku === true,
    catalogWrite: raw.catalogWrite === true,
  };
}

export function extractRouteList(doc) {
  if (!isPlainObject(doc)) return [];
  if (Array.isArray(doc.routes)) return doc.routes.map(normalizeRouteRow).filter(Boolean);
  if (Array.isArray(doc.items)) return doc.items.map(normalizeRouteRow).filter(Boolean);
  if (Array.isArray(doc.lines)) return doc.lines.map(normalizeRouteRow).filter(Boolean);
  if (isPlainObject(doc.resource) || doc.route || doc.id) {
    const row = normalizeRouteRow(doc);
    return row ? [row] : [];
  }
  return [];
}

export function looksLikeSample(doc, path) {
  const blob = `${path ?? ""}\n${JSON.stringify(doc ?? {})}`;
  if (doc?.sample === true || doc?.example === true || doc?.kind === "SAMPLE") return true;
  if (typeof doc?.label === "string" && /SAMPLE|labelled_sample|explicit-example/i.test(doc.label)) {
    return true;
  }
  return /SAMPLE|labelled_sample|labeled_sample|explicit-example|--example/.test(blob);
}
