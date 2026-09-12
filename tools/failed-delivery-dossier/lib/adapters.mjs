import {
  AGENT402_STOP_PATH,
  CHECKOUT_TEST_PATH,
  ERROR_CODES,
  EXTRACT_CATALOG_PATH,
  F08_SHA,
  FULFILL_PATH,
  FUNDING_STATES_PACKABLE,
  SOURCE_KINDS,
  WRAPPER_RECEIPT_SCHEMA,
} from "./pins.mjs";
import { isPlainObject } from "./json.mjs";
import { refuse } from "./refuse.mjs";
import { hasPaymentSignaturePayload } from "./guards.mjs";
import { executionFacts } from "./execution.mjs";
import { isDeepStrictEqual } from "node:util";
import {
  classifyExtractHttp,
  extractWhyNotInHand,
  httpCaptureOf,
  originClassOf,
  processCaptureOf,
} from "./observation.mjs";

function evidence({ sourceKind, whyNotInHand, body, extra = {} }) {
  return {
    sourceKind,
    sold: false,
    deliveryInHand: false,
    whyNotInHand,
    body,
    ...extra,
  };
}

export function unwrapWrapperReceipt(body) {
  if (!isPlainObject(body)) return null;
  if (isPlainObject(body.receipt) && body.receipt.schema === WRAPPER_RECEIPT_SCHEMA) {
    return { result: body, receipt: body.receipt };
  }
  if (body.schema === WRAPPER_RECEIPT_SCHEMA) {
    return { result: null, receipt: body };
  }
  return null;
}

export function parseWrapperReceipt(item) {
  const body = item.body;
  const unwrapped = unwrapWrapperReceipt(body);
  if (!unwrapped) {
    return refuse(
      ERROR_CODES.WRAPPER_SHAPE,
      `wrapper-receipt must use schema ${WRAPPER_RECEIPT_SCHEMA} (F08 pin ${F08_SHA})`,
    );
  }
  const { receipt, result } = unwrapped;
  if (receipt.sold !== false || (result && result.sold === true)) {
    return refuse(ERROR_CODES.SOLD_CLAIM, "wrapper receipt sold must be false; this packer never marks a sale");
  }
  const fundingState = receipt.fundingState || result?.fundingState;
  if (![...FUNDING_STATES_PACKABLE, "reserved-fixture"].includes(fundingState)) {
    return refuse(
      ERROR_CODES.NOT_FAILED_DELIVERY,
      `wrapper-receipt fundingState must be rejected or unfunded, got ${String(fundingState)}`,
    );
  }
  const why =
    fundingState === "rejected"
      ? `F08 wrapper refused (${receipt.code || result?.code || "rejected"}); sold is false; delivery is not in hand`
      : "F08 wrapper ran unfunded; sold is false; this is not a paid delivery in hand";
  const proc = processCaptureOf(item);
  const facts = executionFacts(result || receipt);
  if (result?.contract) {
    for (const key of ["contract", "transport", "analysis", "delivery", "fundingState", "jobId"]) {
      if (receipt[key] !== undefined && !isDeepStrictEqual(result[key], receipt[key])) {
        return refuse(ERROR_CODES.WRAPPER_SHAPE, `wrapper and receipt disagree on ${key}`);
      }
    }
  }
  const originClass = proc?.class || originClassOf(item) || "fixture";
  return {
    ok: true,
    evidence: evidence({
      sourceKind: "wrapper-receipt",
      whyNotInHand: why,
      body: receipt,
      extra: {
        fundingState,
        sample: Boolean(receipt.sample || result?.sample),
        code: receipt.code || result?.code || null,
        observationStatus: proc ? "observed" : "fixture",
        observedHttpStatus: null,
        ...facts,
        // Keep full execution evidence, including IDs and actual output digests.
        execution: result,
        cli: proc,
        origin: {
          class: originClass,
          pin: facts.contract ? null : F08_SHA,
          engine: receipt.engine || null,
          schema: WRAPPER_RECEIPT_SCHEMA,
        },
      },
    }),
  };
}

function checkoutPending(body) {
  if (!isPlainObject(body)) return false;
  const verify = isPlainObject(body.verify) ? body.verify : body;
  const order = isPlainObject(body.order) ? body.order : null;
  if (verify.fulfillmentPending === true) return { verify, order };
  if (order && order.status === "intake_required") return { verify, order };
  if (verify.status === "intake_required") return { verify, order };
  return null;
}

export function parseCheckoutIntake(item) {
  const pending = checkoutPending(item.body);
  if (!pending) {
    return refuse(
      ERROR_CODES.CHECKOUT_SHAPE,
      "checkout-intake requires fulfillmentPending true or order status intake_required",
    );
  }
  const { verify, order } = pending;
  if (verify.sold === true || order?.sold === true) {
    return refuse(ERROR_CODES.SOLD_CLAIM, "checkout-intake sold must not be true");
  }
  const capture = httpCaptureOf(item);
  const originClass = capture?.class || originClassOf(item) || item.originClass || "fixture";
  return {
    ok: true,
    evidence: evidence({
      sourceKind: "checkout-intake",
      whyNotInHand:
        verify.reason ||
        "Payment verify returned fulfillmentPending; order is intake_required; task intake is missing so delivery is not in hand",
      body: {
        verify,
        ...(order ? { order } : {}),
      },
      extra: {
        fulfillmentPending: true,
        orderStatus: order?.status || "intake_required",
        observationStatus: capture ? "observed" : "fixture",
        observedHttpStatus: capture ? capture.status : null,
        outcomeKind: "incomplete-delivery",
        http: capture,
        origin: {
          class: originClass,
          copiedFrom: [CHECKOUT_TEST_PATH, FULFILL_PATH, "server/routes/checkout.js"],
        },
      },
    }),
  };
}

export function parseExtractUnpaid(item) {
  const body = item.body;
  if (!isPlainObject(body)) {
    return refuse(ERROR_CODES.EXTRACT_SHAPE, "extract-unpaid body must be a JSON object");
  }
  if (hasPaymentSignaturePayload(body)) {
    return refuse(
      ERROR_CODES.PAYMENT_SIGNATURE_REFUSED,
      "extract-unpaid evidence must not carry a PAYMENT-SIGNATURE to send",
    );
  }
  const stop = body.state === "stop";
  const classified = stop ? null : classifyExtractHttp({ body, item });
  const contractAmount = isPlainObject(body.contract) ? body.contract.amount : body.amount;
  if (!stop && !classified) {
    return refuse(
      ERROR_CODES.EXTRACT_SHAPE,
      "extract-unpaid requires Agent402 state stop, an expected unpaid 402 fixture, or a captured HTTP status",
    );
  }
  if (classified?.notFailedDelivery) {
    return refuse(
      ERROR_CODES.NOT_FAILED_DELIVERY,
      `observed HTTP ${classified.observedHttpStatus} is not a failed unpaid extract`,
    );
  }
  if (body.sold === true || body.paid === true || body.success === true) {
    return refuse(ERROR_CODES.SOLD_CLAIM, "extract unpaid-stop is not a sale or success");
  }
  const capture = classified?.capture || null;
  const originClass = capture?.class || originClassOf(item) || "fixture";
  return {
    ok: true,
    evidence: evidence({
      sourceKind: "extract-unpaid",
      whyNotInHand: extractWhyNotInHand({
        stop,
        recorded: body.recorded,
        classified,
      }),
      body,
      extra: {
        state: body.state || null,
        expectedStatus: stop ? null : classified?.expectedStatus ?? null,
        observedHttpStatus: stop ? null : classified?.observedHttpStatus ?? null,
        observationStatus: stop ? "fixture" : classified.observationStatus,
        outcomeKind: stop ? "runtime-stop" : classified.outcomeKind,
        amountAtomic: contractAmount || null,
        http: capture,
        origin: {
          class: originClass,
          copiedFrom: stop ? AGENT402_STOP_PATH : capture ? capture.path : EXTRACT_CATALOG_PATH,
        },
      },
    }),
  };
}

export const defaultAdapters = Object.freeze({
  "wrapper-receipt": parseWrapperReceipt,
  "checkout-intake": parseCheckoutIntake,
  "extract-unpaid": parseExtractUnpaid,
});

export function adapterFor(sourceKind, adapters = defaultAdapters) {
  if (!SOURCE_KINDS.includes(sourceKind)) return null;
  return adapters[sourceKind] || defaultAdapters[sourceKind];
}
