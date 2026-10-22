// Count payable x402 entries by shape. Object keys are not a resource list.

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isResourceUrl(value) {
  return typeof value === "string" && (/^https?:\/\//i.test(value) || value.startsWith("/"));
}

export function x402EntryUrl(entry) {
  if (!isObject(entry)) return "";
  if (isResourceUrl(entry.resource)) return entry.resource;
  if (isResourceUrl(entry.url)) return entry.url;
  if (isObject(entry.resource)) {
    if (isResourceUrl(entry.resource.url)) return entry.resource.url;
    if (isResourceUrl(entry.resource.resource)) return entry.resource.resource;
  }
  return "";
}

function paymentObjects(entry) {
  const found = [];
  if (Array.isArray(entry.accepts)) found.push(...entry.accepts);
  if (isObject(entry.resource) && Array.isArray(entry.resource.accepts)) found.push(...entry.resource.accepts);
  return found.filter(isObject);
}

export function x402EntryPayable(entry) {
  if (!isObject(entry)) return false;
  for (const item of paymentObjects(entry)) {
    if (typeof item.scheme === "string" && item.scheme) return true;
    if (item.network && (item.asset || item.amount || item.maxAmountRequired || item.payTo)) return true;
  }
  return !!(entry.payTo && (entry.asset || entry.amount || entry.maxAmountRequired));
}

function listCount(root, key) {
  return Array.isArray(root?.[key]) ? root[key] : null;
}

/** @returns {{valid:number, invalid:number, items:number, resources:number}} */
export function countX402Entries(doc) {
  const roots = [doc];
  if (isObject(doc?.x402)) roots.push(doc.x402);
  const seen = new Set();
  const urls = new Set();
  let invalid = 0;
  let items = 0;
  let resources = 0;
  for (const root of roots) {
    for (const key of ["resources", "items"]) {
      const list = listCount(root, key);
      if (!list || seen.has(list)) continue;
      seen.add(list);
      if (key === "items") items += list.length;
      else resources += list.length;
      for (const entry of list) {
        const url = x402EntryUrl(entry);
        if (url && x402EntryPayable(entry)) urls.add(url);
        else invalid += 1;
      }
    }
  }
  return { valid: urls.size, invalid, items, resources };
}

const EMPTY_FIELDS = ["instructions", "note", "description", "message", "comment"];
const EMPTY_RE = /\b(no|none|zero)\b[^.]{0,120}\b(paid|payable|resources|endpoints)\b|intentionally empty|\bno paid\b|not currently published/i;

/** The first field that says the payable list is intentionally empty. */
export function x402EmptyDeclaration(doc) {
  const roots = [doc];
  if (isObject(doc?.x402)) roots.push(doc.x402);
  for (const root of roots) {
    if (!isObject(root)) continue;
    for (const field of EMPTY_FIELDS) {
      const text = root[field];
      if (typeof text === "string" && text.trim() && EMPTY_RE.test(text)) return text.trim();
    }
  }
  return "";
}
