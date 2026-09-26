import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { F08_PIN_SHA, LEDGER_SCHEMA, TERMS_SHAPE_VERSION } from "./pins.mjs";
import { inspectSample } from "./sample.mjs";
import { isSaleLikeItem } from "./funding.mjs";
import { fixturePrice, livePriceMutation } from "./prices.mjs";
import { buildBatchTerms, termsVersionForBatch } from "./terms.mjs";
import { loadF08Module, mapF08ResultToItem, resolveF08Root } from "./adapters.mjs";
import { BatchRefuse, parseBatchRequest } from "./request.mjs";

function itemRejection({
  id,
  engineId,
  code,
  message,
  detail,
  sample = false,
  sampleReasons = [],
  fundingState = "rejected",
}) {
  return {
    id,
    chargeId: id,
    engineId,
    outcome: "rejected",
    fundingState,
    sold: false,
    sample,
    sampleReasons,
    purchaseAuthority: false,
    liveSettleAttempted: false,
    liveSettleAllowed: false,
    price: fixturePrice(engineId, id),
    code,
    error: message,
    detail: detail || null,
    outputs: [],
    runner: "paid-useful-jobs",
    runnerPin: F08_PIN_SHA,
  };
}

async function runOneItem(item, { offerAdapter, outRoot }) {
  const priceHit = livePriceMutation(item, item);
  if (priceHit) {
    return itemRejection({
      id: item.id,
      engineId: item.engineId,
      code: priceHit.code,
      message: priceHit.message,
    });
  }

  if (!item.job) {
    return itemRejection({
      id: item.id,
      engineId: item.engineId,
      code: "unknown-engine",
      message: `unknown engine ${item.engineId}`,
    });
  }

  const sampleInfo = inspectSample(item);
  if (sampleInfo.sample && isSaleLikeItem(item)) {
    return itemRejection({
      id: item.id,
      engineId: item.engineId,
      code: "sample-not-a-sale",
      message: "SAMPLE/--example inputs produce labeled sample output and cannot be treated as a paid sale",
      sample: sampleInfo.sample,
      sampleReasons: sampleInfo.reasons,
    });
  }

  const itemOut = join(outRoot, item.id);
  mkdirSync(itemOut, { recursive: true });

  const result = await offerAdapter.runPaidOffer({
    jobId: item.engineId,
    inputs: item.files,
    example: item.example,
    fundingIntent: item.fundingIntent || item.funding,
    payment: item.payment,
    settle: item.settle,
    outDir: itemOut,
  });
  const mapped = mapF08ResultToItem(item.engineId, result);
  return {
    id: item.id,
    chargeId: item.id,
    ...mapped,
    sold: false,
    purchaseAuthority: false,
    liveSettleAttempted: false,
    liveSettleAllowed: false,
    price: fixturePrice(item.engineId, item.id),
    sample: mapped.sample || sampleInfo.sample,
    sampleReasons: mapped.sampleReasons?.length ? mapped.sampleReasons : sampleInfo.reasons,
    runner: "paid-useful-jobs",
    runnerPin: F08_PIN_SHA,
    detail: result?.detail || null,
  };
}

function batchStatus(items) {
  const completed = items.filter((i) => i.outcome === "completed").length;
  const rejected = items.filter((i) => i.outcome === "rejected").length;
  if (rejected === 0) return "completed";
  if (completed === 0) return "rejected";
  return "partial";
}

function ledgerEnvelope({ items, batchId, persistKind, terms, termsVersion }) {
  const status = batchStatus(items);
  return {
    schema: LEDGER_SCHEMA,
    schemaVersion: TERMS_SHAPE_VERSION,
    batchId,
    termsVersion,
    termsRevision: 0,
    charges: terms.charges,
    status,
    sold: false,
    purchaseAuthority: false,
    liveSettlement: "out-of-scope",
    runner: "paid-useful-jobs",
    runnerPin: F08_PIN_SHA,
    persistKind,
    counts: {
      items: items.length,
      completed: items.filter((i) => i.outcome === "completed").length,
      rejected: items.filter((i) => i.outcome === "rejected").length,
    },
    items,
    anySold: false,
    liveCatalogWritten: false,
  };
}

function rejectedEnvelope({ code, error, detail, persistKind, batchId }) {
  return {
    schema: LEDGER_SCHEMA,
    schemaVersion: TERMS_SHAPE_VERSION,
    batchId: batchId || randomUUID(),
    termsVersion: null,
    status: "rejected",
    sold: false,
    purchaseAuthority: false,
    liveSettlement: "out-of-scope",
    runner: "paid-useful-jobs",
    runnerPin: F08_PIN_SHA,
    persistKind,
    code,
    error,
    detail: detail || null,
    items: [],
    charges: [],
    anySold: false,
    liveCatalogWritten: false,
  };
}

/**
 * Batch ledger: item-level price/outcome/fundingState. Consumes SDS PR52
 * runPaidOffer + classifyFunding. One rejection cannot mark siblings sold.
 */
export async function runBatch(raw, options = {}) {
  const baseDir = options.baseDir || process.cwd();
  const persistKind = options.persistKind || "memory";
  let request;
  try {
    request = parseBatchRequest(raw, { baseDir });
  } catch (err) {
    if (err instanceof BatchRefuse) {
      return rejectedEnvelope({
        code: err.code,
        error: err.message,
        detail: err.detail,
        persistKind,
        batchId: options.batchId,
      });
    }
    throw err;
  }

  if (request.publishToLiveCatalog) {
    return rejectedEnvelope({
      code: "live-price-mutation-refused",
      error: "Fixture prices are not published to the live catalog",
      persistKind,
    });
  }

  const root = resolveF08Root(options.f08Root);
  const offerAdapter = options.offerAdapter || (await loadF08Module(root));
  if (!offerAdapter?.runPaidOffer) {
    return rejectedEnvelope({
      code: "runner-unavailable",
      error: `SDS PR52 runPaidOffer is required (pin ${F08_PIN_SHA}); missing runner is incomplete, not a useful-jobs fallback`,
      detail: { pin: F08_PIN_SHA, env: "F08_PIN_ROOT" },
      persistKind,
    });
  }

  const outRoot = options.outDir || mkdtempSync(join(tmpdir(), "paid-batch-"));
  mkdirSync(outRoot, { recursive: true });

  const terms = buildBatchTerms({ items: request.items });
  const termsVersion = termsVersionForBatch(terms);

  const items = [];
  for (const item of request.items) {
    items.push(await runOneItem(item, { offerAdapter, outRoot }));
  }

  const ledger = ledgerEnvelope({
    items,
    batchId: options.batchId || randomUUID(),
    persistKind,
    terms,
    termsVersion,
  });

  if (options.persist) {
    await options.persist(ledger);
  }

  return ledger;
}

export { parseBatchRequest, BatchRefuse };
