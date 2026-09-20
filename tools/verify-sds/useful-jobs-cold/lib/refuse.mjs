import { envelope, failError } from "./envelope.mjs";
import { FEATURE } from "./pin.mjs";

export function refuseLive({ flag = "--live" } = {}) {
  return envelope({
    ok: false,
    command: "seeded",
    feature: FEATURE,
    status: "usage",
    error: failError(
      "LIVE_REFUSE",
      `refusing ${flag}: useful-jobs-cold is an offline kit copy + sha/bytes gate. Never fetch live hosts, CDP, or agents.samedaydesk.com.`,
      {
        flag,
        never: ["--live", "--live=true", "CDP", "agents.samedaydesk.com"],
      },
    ),
    result: {
      seed: "live",
      refused: true,
      liveFetch: false,
      paymentSent: false,
    },
  });
}

export function refusePayment({ flag = "--payment" } = {}) {
  return envelope({
    ok: false,
    command: "seeded",
    feature: FEATURE,
    status: "usage",
    error: failError(
      "PAYMENT_REFUSE",
      `refusing ${flag}: useful-jobs-cold never Stripe, x402, checkout, payment, neo, or publish.`,
      {
        flag,
        never: ["--stripe", "--x402", "--checkout", "--payment", "--neo", "--publish"],
      },
    ),
    result: {
      seed: "payment",
      refused: true,
      paymentSent: false,
      stripeOrX402: false,
    },
  });
}
