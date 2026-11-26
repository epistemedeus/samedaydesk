const PRIVATE_KEY = /^(email|authorization|cookie|client_secret|payment_intent|payment_intent_id|customer_id|customer_email|order_id|account_id|phone|address|card)$/i;
const PRIVATE_HINT = /secret|token|password|credential|private[_-]?key|api[_-]?key/i;

export function isPrivateField(key) {
  if (typeof key !== "string" || key.length === 0) return false;
  return PRIVATE_KEY.test(key) || PRIVATE_HINT.test(key);
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
