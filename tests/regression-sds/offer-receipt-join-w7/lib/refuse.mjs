const MONEY_FLAGS = new Set([
  "--pay",
  "--payment",
  "--checkout",
  "--settle",
  "--live",
  "--publish",
  "--neo",
  "--neo-kernel-vendor",
  "--stripe",
  "--wallet",
  "--cdp",
]);

const MONEY_MODES = new Set([
  "pay",
  "payment",
  "checkout",
  "settle",
  "live",
  "purchase",
  "charge",
]);

const MONEY_INTENTS = new Set(["checkout", "pay", "settle", "purchase", "charge"]);

const MONEY_HEADER_RE = /PAYMENT-SIGNATURE|X-PAYMENT|STRIPE-SECRET|sk_live_|whsec_/i;

export function refusedArgv(argv = process.argv.slice(2)) {
  return argv.filter((a) => MONEY_FLAGS.has(a) || MONEY_FLAGS.has(a.split("=")[0]));
}

export function scanMoneyMovement(value, path = "$", into = []) {
  if (value == null) return into;
  if (typeof value === "string") {
    if (MONEY_HEADER_RE.test(value)) {
      into.push({ path, code: "money_movement_refused", message: "payment header or secret-shaped string" });
    }
    return into;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => scanMoneyMovement(item, `${path}[${i}]`, into));
    return into;
  }
  if (typeof value !== "object") return into;

  if (typeof value.mode === "string" && MONEY_MODES.has(value.mode)) {
    into.push({ path: `${path}.mode`, code: "money_movement_refused", message: `mode ${value.mode} is refused` });
  }
  if (typeof value.intent === "string" && MONEY_INTENTS.has(value.intent)) {
    into.push({ path: `${path}.intent`, code: "money_movement_refused", message: `intent ${value.intent} is refused` });
  }
  if (value.paymentSent === true || value.charged === true) {
    into.push({ path, code: "money_movement_refused", message: "charged/paymentSent true is refused in this join pack" });
  }
  if (value.live === true || value.fetchLive === true) {
    into.push({ path, code: "money_movement_refused", message: "live fetch is refused" });
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === "__proto__" || key === "prototype" || key === "constructor") continue;
    scanMoneyMovement(child, `${path}.${key}`, into);
  }
  return into;
}
