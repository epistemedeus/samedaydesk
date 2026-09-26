/** R2-EXCHANGE-08 — Thin requester-to-delivery journey compose. */

export const SCHEMA = "neomorphic.r2.exchange.journey.v1";

export const JOURNEY_STEP = Object.freeze({
  BRIEF: "brief",
  COMPARE: "compare",
  AGREE: "agree",
  ADMIT: "admit",
  DELIVER: "deliver",
  CORRECT: "correct",
  LIFECYCLE: "lifecycle",
  DISPUTE: "dispute",
  DONE: "done",
});
