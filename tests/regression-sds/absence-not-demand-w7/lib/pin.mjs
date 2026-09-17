/** Feature + cash boundary for absence≠demand regression (W0-X138 / w7). */
export const FEATURE = "absence-not-demand-w7";

export const BOUNDARY = Object.freeze({
  paymentSent: false,
  stripeOrX402: false,
  neoPublish: false,
  liveFetch: false,
});

/** Cite: observatory paidActivity must stay explicit when unavailable. */
export const PRINCIPLE = Object.freeze({
  id: "absence-not-demand",
  statement:
    "Absence of paid activity, routes, pricing rows, or demand signals is not market or paid demand.",
});
