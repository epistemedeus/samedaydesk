import { ERROR_CODES } from "./constants.mjs";

const PAYMENT_RETRY_FLAGS = new Set([
  "retryPayment",
  "replayPayment",
  "autoPay",
  "approvePayment",
  "pay",
  "retry",
]);

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  error.ok = false;
  return error;
}

export function looksLikeFetchUrl(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return true;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function refuseLiveFetch(before, after, extra = {}) {
  const candidates = [before, after, extra.liveUrl, extra.fetchUrl, extra.url];
  for (const value of candidates) {
    if (looksLikeFetchUrl(value)) {
      throw fail(
        ERROR_CODES.LIVE_FETCH_URL,
        "live fetch URL input is refused; supply already-held local extract-batch JSON files",
      );
    }
  }
  if (extra.fetch === true || extra.live === true || extra.liveSafe === true) {
    throw fail(
      ERROR_CODES.LIVE_FETCH_URL,
      "live fetch URL input is refused; this job does not fetch",
    );
  }
}

export function refusePaymentRetry(options = {}, job = {}) {
  const payment = job.payment && typeof job.payment === "object" ? job.payment : {};
  const wantsRetry =
    options.retryPayment === true ||
    options.replayPayment === true ||
    options.autoPay === true ||
    options.approvePayment === true ||
    job.retryPayment === true ||
    job.replayPayment === true ||
    payment.replay === true ||
    payment.retry === true ||
    payment.automaticRetries === true;
  if (wantsRetry) {
    throw fail(
      ERROR_CODES.PAYMENT_RETRY,
      "payment retry is refused; this job does not pay or replay authorization",
    );
  }
}

export function refuseSampleAsDelivered(options = {}, job = {}) {
  const sample =
    options.example === true ||
    options.sample === true ||
    job.sample === true ||
    job.example === true ||
    job.freeSample === true ||
    String(job.id || "").toUpperCase() === "SAMPLE" ||
    String(job.label || "").toUpperCase() === "SAMPLE";
  const asDelivered = options.deliveredWatch === true || job.deliveredWatch === true;
  if (sample || asDelivered) {
    throw fail(
      ERROR_CODES.SAMPLE_AS_DELIVERED_WATCH,
      "SAMPLE or --example is not a delivered watch",
    );
  }
}

export function refuseQuoteAsSuccess(document, options = {}) {
  if (options.treatQuoteAsSuccess === true || options.successFrom === "quote") {
    throw fail(
      ERROR_CODES.QUOTE_AS_SUCCESS,
      "extract quote is not page-change success; compare sources[].data only",
    );
  }
  if (!document || typeof document !== "object" || Array.isArray(document)) return;
  const hasQuote = Object.hasOwn(document, "quote");
  const hasSources = Array.isArray(document.sources);
  if (hasQuote && !hasSources) {
    throw fail(
      ERROR_CODES.QUOTE_AS_SUCCESS,
      "extract quote is not page-change success; compare sources[].data only",
    );
  }
}

export function isPaymentRetryArg(flag) {
  return PAYMENT_RETRY_FLAGS.has(flag) || flag === "retry-payment" || flag === "auto-pay" || flag === "approve";
}
