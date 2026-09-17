import { pathToFileURL } from "node:url";
import { CUSTOM_QUOTE_SLUG, LLMS_LABEL_ALIASES } from "./constants.mjs";

export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function usdToCents(usd) {
  const n = Number(usd);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function centsOfAdvertisement(row) {
  if (!isPlainObject(row)) return null;
  if (Number.isInteger(row.amountCents)) return row.amountCents;
  if (Number.isInteger(row.amount)) return row.amount;
  if (row.priceUsd != null) return usdToCents(row.priceUsd);
  if (row.price != null) {
    const n = Number(row.price);
    if (!Number.isFinite(n)) return null;
    // Homepage catalog uses whole dollars (149), not cents.
    return n >= 1000 ? Math.round(n) : Math.round(n * 100);
  }
  return null;
}

export async function loadAuthoritativeOffers(pricingPath) {
  const mod = await import(pathToFileURL(pricingPath).href);
  const offers = mod.OFFERS;
  if (!isPlainObject(offers)) {
    throw new Error("server/pricing.js did not export OFFERS object");
  }
  const skus = Object.entries(offers).map(([slug, rec]) => ({
    slug,
    amountCents: Number(rec?.amount),
    label: typeof rec?.label === "string" ? rec.label : slug,
    category: rec?.category || null,
  }));
  const bySlug = Object.fromEntries(skus.map((s) => [s.slug, s]));
  const byLabel = Object.fromEntries(skus.map((s) => [s.label, s]));
  return { offers, skus, bySlug, byLabel, getOffer: mod.getOffer };
}

export function parseClientCatalog(source) {
  const advertised = [];
  const re = /slug:\s*"([a-z0-9_]+)"/g;
  let m;
  while ((m = re.exec(source))) {
    const slug = m[1];
    const window = source.slice(m.index, m.index + 500);
    const nameM = window.match(/name:\s*"([^"]+)"/);
    const priceM = window.match(/price:\s*(\d+)/);
    if (!priceM) continue;
    advertised.push({
      slug,
      name: nameM ? nameM[1] : null,
      amountCents: Number(priceM[1]) * 100,
      surface: "client.services",
    });
  }
  return advertised;
}

export function parsePaymentLinkSlugs(source) {
  const blockM = source.match(/export const PAYMENT_LINKS[\s\S]*?\{([\s\S]*?)\n\};/);
  if (!blockM) return [];
  const slugs = [];
  const re = /([a-z0-9_]+):\s*"https:\/\/buy\.stripe\.com[^"]*"/g;
  let m;
  while ((m = re.exec(blockM[1]))) slugs.push(m[1]);
  return slugs;
}

export function parseLlmsPricedLines(source) {
  const start = source.indexOf("## Start here");
  const end = source.indexOf("## Agent interfaces");
  const section =
    start >= 0 ? source.slice(start, end > start ? end : undefined) : source;
  const advertised = [];
  const re = /^-\s+(.+?):\s+\$(\d+)\.?\s*$/gm;
  let m;
  while ((m = re.exec(section))) {
    const name = m[1].trim();
    advertised.push({
      slug: LLMS_LABEL_ALIASES[name] || null,
      name,
      amountCents: Number(m[2]) * 100,
      surface: "llms.txt",
    });
  }
  return advertised;
}

export function parseFixtureDocument(raw) {
  const text = String(raw ?? "");
  if (text.trim() === "") {
    return { kind: "empty", document: null, advertised: [] };
  }
  let document;
  try {
    document = JSON.parse(text);
  } catch {
    return { kind: "invalid_json", document: null, advertised: [] };
  }
  if (!isPlainObject(document)) {
    return { kind: "invalid_document", document, advertised: [] };
  }
  const advertised = Array.isArray(document.advertised)
    ? document.advertised.filter(isPlainObject).map((row) => ({
        slug: typeof row.slug === "string" ? row.slug.trim() : "",
        name: typeof row.name === "string" ? row.name : null,
        amountCents: centsOfAdvertisement(row),
        surface: row.surface || "fixture",
      }))
    : [];
  return { kind: "object", document, advertised };
}

export function isSkuChangeAttempt(document, flags = {}) {
  if (flags.editPrices || flags.editSkus || flags.writePrices) return true;
  if (!isPlainObject(document)) return false;
  if (document.editLivePrices === true || document.skuChange === true) return true;
  if (Array.isArray(document.changes) && document.changes.length > 0) return true;
  if (isPlainObject(document.newPrices) && Object.keys(document.newPrices).length > 0) {
    return true;
  }
  return false;
}

export { CUSTOM_QUOTE_SLUG };
