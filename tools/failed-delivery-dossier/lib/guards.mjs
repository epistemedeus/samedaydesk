import { BUYER_CLASSES, ERROR_CODES, I01_TERMS_VERSION_RE } from "./pins.mjs";
import { isPlainObject, walk } from "./json.mjs";

const DELIVERED_LABELS = new Set(["delivered", "in_hand", "complete_delivery", "handed_over"]);

export function isSample(value) {
  if (!isPlainObject(value)) return false;
  if (value.sample === true || value.example === true || value.exampleMode === true) return true;
  if (value.label === "SAMPLE" || value.sampleLabel === "SAMPLE" || value.kind === "SAMPLE") return true;
  if (Array.isArray(value.sampleReasons) && value.sampleReasons.length > 0) return true;
  return false;
}

export function hasDeliveredLabel(value) {
  if (!isPlainObject(value)) return false;
  const candidates = [
    value.status,
    value.delivery,
    value.deliveryStatus,
    value.validDeliveryStatus,
    value.labelledDelivery,
    value.deliveryLabel,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && DELIVERED_LABELS.has(candidate.toLowerCase())) return true;
  }
  if (value.labelledDelivered === true || value.delivered === true) return true;
  return false;
}

export function isSampleLabelledDelivered(value) {
  if (!isPlainObject(value)) return false;
  const receipt = isPlainObject(value.receipt) ? value.receipt : value;
  return isSample(value) || isSample(receipt)
    ? hasDeliveredLabel(value) || hasDeliveredLabel(receipt)
    : false;
}

export function integerTermsVersion(value) {
  let hit = null;
  walk(value, (node) => {
    if (hit || !isPlainObject(node) || !Object.hasOwn(node, "termsVersion")) return;
    const tv = node.termsVersion;
    if (typeof tv === "number" && Number.isInteger(tv)) {
      hit = tv;
      return;
    }
    if (typeof tv === "string" && /^(0|[1-9]\d*)$/.test(tv) && !I01_TERMS_VERSION_RE.test(tv)) {
      hit = tv;
    }
  });
  return hit;
}

function buyerClassOf(node) {
  if (!isPlainObject(node)) return null;
  const raw = node.buyerClass ?? node.buyer_class;
  if (typeof raw === "string" && BUYER_CLASSES.includes(raw)) return raw;
  return null;
}

/**
 * Refuse mixing buyerClass rows into a single revenue/sold total.
 * Evidence-records keep buyerClass buckets separate; this packer does not
 * invent banked revenue from failed-delivery items.
 */
export function detectBuyerClassRevenueMix(value) {
  if (value === true) return "as-revenue flag";
  if (!isPlainObject(value) && !Array.isArray(value)) return null;

  if (isPlainObject(value)) {
    if (
      value.mixBuyerClassIntoRevenue === true ||
      value.buyerClassAsRevenue === true ||
      value.asRevenue === true
    ) {
      return "buyerClass requested as revenue";
    }
    const totalKeys = ["revenueTotal", "soldTotal", "revenue", "bankedRevenueFromBuyerClass"];
    for (const key of totalKeys) {
      const total = value[key];
      if (total == null) continue;
      const parts = Array.isArray(total)
        ? total
        : isPlainObject(total)
          ? total.parts || total.byBuyerClass
          : null;
      if (!Array.isArray(parts)) {
        if (isPlainObject(total) && buyerClassOf(total) && (total.usdc || total.amountUsdc)) {
          return `${key} treats buyerClass as revenue`;
        }
        continue;
      }
      if (parts.some((part) => buyerClassOf(part))) {
        return `${key} mixes buyerClass into a revenue total`;
      }
    }
  }

  let mix = null;
  walk(value, (node) => {
    if (mix || !isPlainObject(node)) return;
    if (node.mixBuyerClassIntoRevenue === true || node.buyerClassAsRevenue === true) {
      mix = "buyerClass requested as revenue";
      return;
    }
    const parts = node.parts || node.byBuyerClass;
    if (Array.isArray(parts) && (node.metricId === "revenue" || node.asRevenue === true || node.role === "revenue")) {
      const classes = new Set(parts.map(buyerClassOf).filter(Boolean));
      if (classes.size >= 1) mix = "aggregate mixes buyerClass into revenue";
    }
  });
  return mix;
}

const REFUND_NAMES = new Set(["refund", "refunds", "issue-refund", "issue_refund"]);
const RETRY_NAMES = new Set(["retry-payment", "retry_payment", "retryPayment", "pay-again"]);
const SIGNATURE_NAMES = new Set([
  "payment-signature",
  "PAYMENT-SIGNATURE",
  "send-payment-signature",
  "sendPaymentSignature",
]);
const STRIPE_NAMES = new Set(["stripe", "call-stripe", "callStripe"]);

export function detectForbiddenAction(input, argvFlags = {}) {
  if (argvFlags.refund || REFUND_NAMES.has(String(input.action || "")) || input.refund === true) {
    return { code: ERROR_CODES.REFUND_REFUSED, message: "read-only packer never refunds" };
  }
  if (argvFlags.retryPayment || RETRY_NAMES.has(String(input.action || "")) || input.retryPayment === true) {
    return { code: ERROR_CODES.RETRY_PAYMENT_REFUSED, message: "read-only packer never retries payment" };
  }
  if (
    argvFlags.paymentSignature ||
    SIGNATURE_NAMES.has(String(input.action || "")) ||
    input.sendPaymentSignature === true ||
    input.paymentSignature === true
  ) {
    return { code: ERROR_CODES.PAYMENT_SIGNATURE_REFUSED, message: "read-only packer never sends PAYMENT-SIGNATURE" };
  }
  if (argvFlags.stripe || STRIPE_NAMES.has(String(input.action || "")) || input.callStripe === true) {
    return { code: ERROR_CODES.STRIPE_CALL_REFUSED, message: "read-only packer never calls Stripe" };
  }
  return null;
}

export function hasPaymentSignaturePayload(value) {
  let hit = false;
  walk(value, (node) => {
    if (hit) return;
    if (isPlainObject(node)) {
      if (Object.hasOwn(node, "PAYMENT-SIGNATURE") || Object.hasOwn(node, "paymentSignature")) hit = true;
      const headers = node.headers;
      if (isPlainObject(headers) && (headers["PAYMENT-SIGNATURE"] || headers["payment-signature"])) hit = true;
    }
  });
  return hit;
}
