import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  CALLER_BUDGET_AFTER,
  CALLER_BUDGET_BEFORE,
  DEFAULT_OFFER,
  READOUT_CONTRACT,
} from "./pins.mjs";
import { inspectRunBuyerClass } from "./buyer-class.mjs";
import { classifyCohort } from "./cohort.mjs";
import { scanSiblingSlots } from "./siblings.mjs";
import { invokeWrapper } from "./wrapper-adapter.mjs";

function iso(ms) {
  return new Date(ms).toISOString();
}

export async function runDryRun(options = {}) {
  const labelled = inspectRunBuyerClass({ buyerClass: options.buyerClass || "owner-qa" });
  if (!labelled.ok) return labelled;

  const wrapper = await invokeWrapper(
    {
      jobId: DEFAULT_OFFER,
      inputs: { before: CALLER_BUDGET_BEFORE, after: CALLER_BUDGET_AFTER },
      fundingIntent: "unfunded",
    },
  );
  const missing = await invokeWrapper({
    jobId: DEFAULT_OFFER,
    inputs: {},
    fundingIntent: "unfunded",
  });
  const sampleSale = await invokeWrapper({
    jobId: DEFAULT_OFFER,
    example: true,
    fundingIntent: "reserved-fixture",
    payment: { fixture: true, purchaseAuthority: false, label: "fixture", live: false },
  });
  const repeat = await invokeWrapper({
    jobId: DEFAULT_OFFER,
    inputs: { before: CALLER_BUDGET_BEFORE, after: CALLER_BUDGET_AFTER },
    fundingIntent: "reserved-fixture",
    payment: { fixture: true, purchaseAuthority: false, label: "fixture", live: false },
  });

  const t0 = Date.parse("2026-09-11T22:00:00.000Z");
  const siblings = scanSiblingSlots();
  const observations = [
    ...siblings,
    {
      id: "presented-budget",
      kind: "offer-presented",
      at: iso(t0),
      callerKey: "owner-qa:dry-run",
      offerId: DEFAULT_OFFER,
      jobId: DEFAULT_OFFER,
      actorClass: labelled.buyerClass,
    },
    {
      id: "failed-missing-inputs",
      kind: "wrapper-result",
      at: iso(t0 + 1000),
      callerKey: "owner-qa:dry-run",
      offerId: DEFAULT_OFFER,
      jobId: DEFAULT_OFFER,
      jobIndex: 1,
      buyerClass: labelled.buyerClass,
      result: missing.result,
    },
    {
      id: "failed-sample-sale",
      kind: "wrapper-result",
      at: iso(t0 + 2000),
      callerKey: "owner-qa:dry-run",
      offerId: DEFAULT_OFFER,
      jobId: DEFAULT_OFFER,
      jobIndex: 1,
      buyerClass: labelled.buyerClass,
      result: sampleSale.result,
    },
    {
      id: "useful-first",
      kind: "wrapper-result",
      at: iso(t0 + 3000),
      callerKey: "owner-qa:dry-run",
      offerId: DEFAULT_OFFER,
      jobId: DEFAULT_OFFER,
      jobIndex: 1,
      buyerClass: labelled.buyerClass,
      result: wrapper.result,
    },
    {
      id: "repeat-fixture",
      kind: "wrapper-result",
      at: iso(t0 + 4000),
      callerKey: "owner-qa:dry-run",
      offerId: DEFAULT_OFFER,
      jobId: DEFAULT_OFFER,
      jobIndex: 2,
      priorId: "useful-first",
      buyerClass: labelled.buyerClass,
      result: repeat.result,
    },
    {
      id: "presented-noreply",
      kind: "offer-presented",
      at: iso(t0 + 5000),
      callerKey: "owner-qa:no-follow-up",
      offerId: "listing-repair-packet",
      jobId: "listing-repair-packet",
      actorClass: labelled.buyerClass,
    },
  ];

  const readout = classifyCohort(observations);
  const body = {
    ...readout,
    command: "dry-run",
    label: "owner-qa",
    wrapper: wrapper.wrapper,
    contract: READOUT_CONTRACT,
    notClaimed: [
      "independent-demand",
      "organic-demand",
      "paid-return-from-fixture",
      "customer-feedback",
      "settled-revenue",
    ],
  };

  if (options.outDir) {
    mkdirSync(options.outDir, { recursive: true });
    writeFileSync(join(options.outDir, "observations.json"), `${JSON.stringify(observations, null, 2)}\n`);
    writeFileSync(join(options.outDir, "readout.json"), `${JSON.stringify(body, null, 2)}\n`);
  }
  return body;
}
