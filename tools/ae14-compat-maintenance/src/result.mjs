import { sha256Hex } from "../../recurring-job-recipes/lib/hash.mjs";
import { PINS } from "./pins.mjs";
import { TEMPLATE } from "./template.mjs";

const DIGEST_SKIP = new Set(["digest", "executed", "readback"]);

export function finish(partial = {}) {
  const priorSpend = partial.funding?.priorSpend ?? partial.priorSpend ?? "unobserved";
  const body = {
    schema: "samedaydesk.compat-maintenance-occurrence.v1",
    template: TEMPLATE.schema,
    ok: false,
    useful: false,
    usefulness: "not_useful",
    executed: false,
    readback: false,
    secondPost: false,
    posts: 0,
    acceptancePosts: 0,
    quoteWrites: 0,
    code: null,
    message: null,
    occurrenceId: null,
    taskId: null,
    distinctTaskId: null,
    detected: null,
    disposition: null,
    usefulnessClass: null,
    acceptance: "refused",
    acceptanceWinner: false,
    expiryWinner: false,
    defects: [],
    ...partial,
  };

  body.funding = {
    signature: "absent",
    submitted: false,
    confirmedUsableFunding: false,
    paymentSent: false,
    priorSpend,
  };
  body.paid = false;
  body.captured = false;
  body.settled = false;
  body.canonicalSettlement = "not_joined";
  body.captureJoined = false;
  body.paidTaskIncrement = 0;
  body.repurchaseForced = false;
  body.reuseGranted = false;
  body.wrotePrior = false;
  body.wroteQueue = false;
  body.timerStarted = false;
  body.publicEnabled = false;
  body.chainQualified = false;
  body.railPosts = 0;
  body.networkPosts = 0;
  body.hJoin = "pending-join";
  body.serving = {
    publicEnabled: false,
    productionMoney: false,
    scope: "local-shape-only",
  };
  body.supplier228200 = {
    commit: PINS.consumed.supplier228200.commit,
    disposition: "no-delta",
    rerun: false,
  };
  body.finiteQueue228300 = {
    commit: PINS.consumed.finiteQueue228300.commit,
    disposition: "executed-no-delta",
    copied: false,
  };
  body.consumedHeads = {
    e01: PINS.consumed.e01.receiptHead,
    e02: PINS.consumed.e02.receiptHead,
    e06: PINS.consumed.e06.receiptHead,
  };
  body.lowestReliableReward = "unknown";
  body.tokenPriceRecommendation = null;

  const view = {};
  for (const key of Object.keys(body).sort()) {
    if (!DIGEST_SKIP.has(key)) view[key] = body[key];
  }
  body.digest = sha256Hex(view);
  return body;
}
