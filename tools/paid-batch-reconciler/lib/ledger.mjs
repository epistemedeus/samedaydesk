import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { LEDGER_SCHEMA, TERMS_SHAPE_VERSION } from "./pins.mjs";
import { getJob } from "./catalog.mjs";
import { inspectSample } from "./sample.mjs";
import { classifyFunding } from "./funding.mjs";
import { fixturePrice, livePriceMutation } from "./prices.mjs";
import { ensureUsefulJobsKit, runEngineJob } from "./engines.mjs";
import { buildBatchTerms, termsVersionForBatch } from "./terms.mjs";
import { loadF08Module, mapF08ResultToItem, resolveF08Root } from "./adapters.mjs";
import { BatchRefuse, missingRequired, parseBatchRequest } from "./request.mjs";

function itemRejection({ id, engineId, code, message, detail, sample = false, sampleReasons = [], fundingState = "rejected" }) {
  return {
    id,
    engineId,
    outcome: "rejected",
    fundingState,
    sold: false,
    sample,
    sampleReasons,
    purchaseAuthority: false,
    liveSettleAttempted: false,
    liveSettleAllowed: false,
    price: fixturePrice(engineId),
    code,
    error: message,
    detail: detail || null,
    outputs: [],
  };
}

async function runOneItem(item, { kit, offerAdapter, outRoot }) {
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

  const sampleInfo = inspectSample(item, { kitRoot: kit });
  const funding = classifyFunding(item, { sample: sampleInfo.sample });
  if (funding.fundingState === "rejected") {
    return itemRejection({
      id: item.id,
      engineId: item.engineId,
      code: funding.code,
      message: funding.message,
      detail: {
        wouldSettleIfGuardOmitted: funding.wouldSettleIfGuardOmitted || false,
      },
      sample: sampleInfo.sample,
      sampleReasons: sampleInfo.reasons,
    });
  }

  const missing = missingRequired(item);
  if (missing) {
    return itemRejection({
      id: item.id,
      engineId: item.engineId,
      code: missing.code,
      message: missing.message,
      detail: missing,
      sample: sampleInfo.sample,
      sampleReasons: sampleInfo.reasons,
    });
  }

  const itemOut = join(outRoot, item.id);
  mkdirSync(itemOut, { recursive: true });

  if (offerAdapter?.runPaidOffer) {
    const mapped = mapF08ResultToItem(
      item.engineId,
      await offerAdapter.runPaidOffer({
        jobId: item.engineId,
        inputs: item.files,
        example: item.example,
        fundingIntent: item.fundingIntent || item.funding,
        payment: item.payment,
        settle: item.settle,
        outDir: itemOut,
      }),
    );
    return {
      id: item.id,
      ...mapped,
      sold: false,
      purchaseAuthority: false,
      liveSettleAttempted: false,
      liveSettleAllowed: false,
      price: fixturePrice(item.engineId),
      sample: mapped.sample || sampleInfo.sample,
      sampleReasons: mapped.sampleReasons?.length ? mapped.sampleReasons : sampleInfo.reasons,
    };
  }

  const engine = runEngineJob(item.engineId, {
    files: item.files,
    example: item.example,
    outDir: itemOut,
  });
  const job = getJob(item.engineId);
  const outputFiles = job.outputs
    .map((name) => ({ name, path: join(itemOut, name) }))
    .filter((f) => existsSync(f.path));

  const engineFailed = engine.status !== 0 || !engine.json || engine.json.ok === false;
  return {
    id: item.id,
    engineId: item.engineId,
    outcome: engineFailed ? "rejected" : "completed",
    fundingState: funding.fundingState,
    sold: false,
    sample: sampleInfo.sample,
    sampleReasons: sampleInfo.reasons,
    purchaseAuthority: false,
    liveSettleAttempted: false,
    liveSettleAllowed: false,
    price: fixturePrice(item.engineId),
    code: engineFailed ? engine.json?.code || "engine-refused" : null,
    error: engineFailed ? engine.json?.error || engine.stderr || "engine refused" : null,
    outputs: outputFiles,
    runner: "useful-jobs",
    engine: engine.json,
  };
}

function batchStatus(items) {
  const completed = items.filter((i) => i.outcome === "completed").length;
  const rejected = items.filter((i) => i.outcome === "rejected").length;
  if (rejected === 0) return "completed";
  if (completed === 0) return "rejected";
  return "partial";
}

function ledgerEnvelope({ items, request, batchId, persistKind }) {
  const status = batchStatus(items);
  const terms = buildBatchTerms({
    itemCount: items.length,
    engineIds: items.map((i) => i.engineId),
    termsRevision: 0,
  });
  const termsVersion = termsVersionForBatch(terms);
  return {
    schema: LEDGER_SCHEMA,
    schemaVersion: TERMS_SHAPE_VERSION,
    batchId,
    termsVersion,
    termsRevision: 0,
    status,
    sold: false,
    purchaseAuthority: false,
    liveSettlement: "out-of-scope",
    runner: request.runner,
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

/**
 * Batch ledger: item-level price/outcome/fundingState. One rejection cannot
 * mark siblings sold. F08 runPaidOffers is a sequential loop; this is the ledger.
 */
export async function runBatch(raw, options = {}) {
  const baseDir = options.baseDir || process.cwd();
  let request;
  try {
    request = parseBatchRequest(raw, { baseDir });
  } catch (err) {
    if (err instanceof BatchRefuse) {
      return {
        schema: LEDGER_SCHEMA,
        schemaVersion: TERMS_SHAPE_VERSION,
        batchId: options.batchId || randomUUID(),
        termsVersion: null,
        status: "rejected",
        sold: false,
        purchaseAuthority: false,
        liveSettlement: "out-of-scope",
        code: err.code,
        error: err.message,
        detail: err.detail,
        items: [],
        anySold: false,
        liveCatalogWritten: false,
      };
    }
    throw err;
  }

  if (request.publishToLiveCatalog) {
    return {
      schema: LEDGER_SCHEMA,
      schemaVersion: TERMS_SHAPE_VERSION,
      batchId: options.batchId || randomUUID(),
      status: "rejected",
      sold: false,
      code: "live-price-mutation-refused",
      error: "Fixture prices are not published to the live catalog",
      items: [],
      anySold: false,
      liveCatalogWritten: false,
    };
  }

  const kit = ensureUsefulJobsKit();
  let offerAdapter = options.offerAdapter || null;
  if (!offerAdapter && (request.runner === "f08" || options.useF08)) {
    const root = resolveF08Root(options.f08Root);
    const mod = await loadF08Module(root);
    if (mod?.runPaidOffer) offerAdapter = { runPaidOffer: mod.runPaidOffer, root };
  }

  const outRoot = options.outDir || mkdtempSync(join(tmpdir(), "paid-batch-"));
  mkdirSync(outRoot, { recursive: true });

  const items = [];
  for (const item of request.items) {
    items.push(await runOneItem(item, { kit, offerAdapter, outRoot }));
  }

  const ledger = ledgerEnvelope({
    items,
    request,
    batchId: options.batchId || randomUUID(),
    persistKind: options.persistKind || "memory",
  });

  if (options.persist) {
    await options.persist(ledger);
  }

  return ledger;
}

export { parseBatchRequest, BatchRefuse };
