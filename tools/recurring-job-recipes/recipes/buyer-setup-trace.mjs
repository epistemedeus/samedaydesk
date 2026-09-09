import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { costForRecipe } from "../lib/cost.mjs";
import { inspectPaymentAuthority } from "../lib/payment-guard.mjs";
import { recoveryPlan } from "../lib/recovery.mjs";
import { requireMerchantRoot, resolveMerchantRoot } from "../vendor/resolve-merchant-root.mjs";
import { GATEWAY_ORIGIN, MERCHANT_INPUT_PIN } from "../vendor/merchant-contracts.mjs";

export const RECIPE_ID = "buyer-setup-trace";
export const RECIPE_SCHEMA = "samedaydesk.recurring-job-recipe-result.v1";

export const META = Object.freeze({
  recipeId: RECIPE_ID,
  userBenefit:
    "Produce a free live buyer-setup inspection trace for the AgentCash/x402 runtime without paying, signing, or inferring wallet ownership from addresses.",
  operatorSupplies: ["gatewayOrigin (optional)", "clock", "scheduleHint"],
  acceptedContracts: [
    "agent-payment-policy buyer-policy-reference",
    "AgentCash OpenAPI discovery",
    "x402 unpaid 402 challenge (inspect only)",
  ],
});

const DEFAULT_ORIGIN = GATEWAY_ORIGIN;

/**
 * Live free inspection only. Never signs, never pays, never claims address ownership.
 */
export async function runBuyerSetupTrace(input = {}) {
  const clock = input.clock || new Date().toISOString();
  const scheduleHint = input.scheduleHint || null;
  const origin = (input.gatewayOrigin || DEFAULT_ORIGIN).replace(/\/$/, "");
  const fetchImpl = input.fetchImpl || globalThis.fetch;

  const payment = inspectPaymentAuthority({ payment: { attempted: false } }, input);
  if (!payment.ok) {
    return {
      ok: false,
      schema: RECIPE_SCHEMA,
      recipeId: RECIPE_ID,
      meta: META,
      outcome: "error",
      clock,
      scheduleHint,
      cost: costForRecipe(RECIPE_ID),
      recovery: recoveryPlan("error"),
      payment,
      evidence: { kind: "error", code: payment.code, message: payment.message },
    };
  }

  const probes = [];
  const steps = [];

  // Official buyer-policy reference from merchant pin (local module, not paid).
  let buyerPolicy = null;
  const merchantRoot = resolveMerchantRoot();
  if (merchantRoot) {
    const mod = await import(pathToFileURL(join(merchantRoot, "buyer-policy-reference.mjs")).href);
    buyerPolicy = mod.BUYER_POLICY_REFERENCE;
    steps.push({
      step: "load_buyer_policy_reference",
      source: `merchant:${MERCHANT_INPUT_PIN.slice(0, 8)}/buyer-policy-reference.mjs`,
      result: "ok",
    });
  } else {
    steps.push({
      step: "load_buyer_policy_reference",
      result: "skipped",
      reason: "merchant checkout missing",
    });
  }

  const targets = [
    { id: "healthz", path: "/healthz", expect: 200 },
    { id: "openapi", path: "/openapi.json", expect: 200 },
    { id: "x402", path: "/.well-known/x402", expect: 200 },
    { id: "skills", path: "/.well-known/skills/index.json", expect: 200 },
    {
      id: "unpaid_402_extract",
      path: "/extract?url=https%3A%2F%2Fexample.com%2F",
      expect: 402,
    },
  ];

  for (const target of targets) {
    const url = `${origin}${target.path}`;
    const started = performance.now();
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        redirect: "follow",
        headers: { accept: "application/json,*/*;q=0.1" },
      });
      const text = await response.text();
      const elapsedMs = performance.now() - started;
      const headers = {
        "www-authenticate": response.headers.get("www-authenticate"),
        "payment-required": response.headers.get("payment-required") ? "[present]" : null,
        "content-type": response.headers.get("content-type"),
      };
      let summary = null;
      if (target.id === "healthz" && response.ok) {
        const body = JSON.parse(text);
        summary = {
          ok: body.ok === true,
          network: body.network ?? null,
          // Merchant payTo is a seller address. Never treat as buyer wallet ownership.
          merchantPayToPresent: typeof body.payTo === "string",
          merchantPayToOwnership: "unknown_not_inferred",
          paymentProtocols: body.paymentProtocols ?? null,
        };
      } else if (target.id === "unpaid_402_extract") {
        summary = {
          status: response.status,
          paymentRequired: response.status === 402,
          wwwAuthenticatePayment: Boolean(headers["www-authenticate"]?.includes("Payment")),
          bodyError: (() => {
            try {
              return JSON.parse(text).error ?? null;
            } catch {
              return null;
            }
          })(),
          note: "Stopped at unpaid challenge. No signature, no payment, no wallet ownership claim.",
        };
      } else if (response.ok) {
        summary = { status: response.status, bytes: Buffer.byteLength(text) };
      }
      const ok = response.status === target.expect;
      probes.push({
        id: target.id,
        url,
        status: response.status,
        expect: target.expect,
        ok,
        bytes: Buffer.byteLength(text),
        elapsedMs,
        headers,
        summary,
      });
      steps.push({ step: `probe_${target.id}`, result: ok ? "ok" : "mismatch", status: response.status });
    } catch (error) {
      probes.push({
        id: target.id,
        url,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        elapsedMs: performance.now() - started,
      });
      steps.push({ step: `probe_${target.id}`, result: "error" });
    }
  }

  const failed = probes.filter((p) => !p.ok);
  const outcome = failed.length === 0 ? "unchanged" : failed.length < probes.length ? "partial" : "error";

  return {
    ok: outcome === "unchanged" || outcome === "partial",
    schema: RECIPE_SCHEMA,
    recipeId: RECIPE_ID,
    meta: META,
    outcome,
    clock,
    scheduleHint,
    cost: costForRecipe(RECIPE_ID),
    recovery: recoveryPlan(outcome),
    payment: { ...payment, signed: false, paid: false },
    evidence: {
      kind: "buyer_setup_trace",
      origin,
      merchantInputPin: MERCHANT_INPUT_PIN,
      buyerPolicy,
      steps,
      probes,
      claims: {
        liveFreeInspectionOnly: true,
        paymentSigned: false,
        paymentSent: false,
        walletOwnershipInferred: false,
        merchantPayToIsBuyerWallet: false,
        ownerQaOnly: true,
        notDemand: true,
      },
      setupChecklist: [
        "Read OpenAPI / AgentCash discover against gateway origin",
        "Read buyer-policy-reference (no wallet executor)",
        "Inspect unpaid 402 challenge headers; stop without signing",
        "Caller supplies their own funded signer only when explicitly approving a purchase elsewhere",
      ],
    },
  };
}

export function requireMerchantForBuyerSetup() {
  return requireMerchantRoot();
}
