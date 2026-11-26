const PRIVATE_NORMALIZED = new Set([
  "email",
  "authorization",
  "cookie",
  "clientsecret",
  "paymentintent",
  "paymentintentid",
  "customerid",
  "customeremail",
  "orderid",
  "accountid",
  "phone",
  "address",
  "card",
]);
const PRIVATE_HINT = /secret|token|password|credential|private[_-]?key|api[_-]?key/i;

function normalizedKey(key) {
  return String(key).toLowerCase().replace(/[_-]/g, "");
}

export function isPrivateField(key) {
  if (typeof key !== "string" || key.length === 0) return false;
  return PRIVATE_NORMALIZED.has(normalizedKey(key)) || PRIVATE_HINT.test(key);
}

export function publicFacts(value, depth = 0) {
  if (value == null || typeof value !== "object" || depth > 8) return value;
  if (Array.isArray(value)) return value.map((item) => publicFacts(item, depth + 1));
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (isPrivateField(key)) continue;
    out[key] = publicFacts(item, depth + 1);
  }
  return out;
}
