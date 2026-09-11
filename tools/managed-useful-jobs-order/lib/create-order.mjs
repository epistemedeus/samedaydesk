import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OrderRefuse, formatRefuse } from "./errors.mjs";
import { loadCatalog } from "./catalog.mjs";
import { hasOrderId, normalizeRequest } from "./contract.mjs";
import { fileDigest, hashTerms } from "./digest.mjs";
import { findExtractUrl } from "./extract-guard.mjs";
import { CONSUMER_CONTRACT_SCHEMA, ORDER_TERMS_SCHEMA, OWNED_DIR, loadPins } from "./pins.mjs";
import { inspectSample, collectLabeledSampleDigests } from "./sample-guard.mjs";
import { createFileStore } from "./store-file.mjs";
import { loadExecutionContract, EXECUTION_CONTRACT_PIN, TESTED_D01_SHA } from "./wrapper-client.mjs";
import { pidAlive, sleep } from "./pid.mjs";

function earlyRefuse(raw) {
  const extractHit = findExtractUrl(raw);
  if (extractHit) {
    throw new OrderRefuse(
      "f-extract",
      "request targets extract URL; this client is not GET /extract and does not change extract 0.005 USDC",
      { falsifier: "F-EXTRACT", detail: { hit: extractHit } },
    );
  }
  if (!hasOrderId(raw)) {
    throw new OrderRefuse("order-id-omitted", "payable order MUST include immutable orderId", {
      falsifier: "F-ORDER",
    });
  }
  if (raw?.example === true || raw?.example === "true") {
    throw new OrderRefuse(
      "example-not-payable",
      "payable order MUST NOT include example:true or billed SAMPLE work",
      { falsifier: "F-SAMPLE" },
    );
  }
  if (raw?.purchaseAuthority === true) {
    throw new OrderRefuse("f-authority", "purchaseAuthority must stay false", {
      falsifier: "F-AUTHORITY",
    });
  }
  if (raw?.sold === true || raw?.charged === true) {
    throw new OrderRefuse(
      "nonsettling-prototype",
      "Wave payments are nonsettling prototypes; sold and charged stay false",
      { falsifier: "F-DEMAND" },
    );
  }
  if (raw?.schedulerDaemon === true) {
    throw new OrderRefuse("f-daemon", "schedulerDaemon stays false; repeat-job-record is not a daemon", {
      falsifier: "F-DAEMON",
    });
  }
}

export function buildTerms(request, pins) {
  return {
    schema: ORDER_TERMS_SCHEMA,
    engineId: request.engineId,
    orderId: request.orderId,
    enginePin: {
      package: pins.package,
      version: request.enginePin.version,
      sha256: request.enginePin.sha256,
      bytes: request.enginePin.bytes,
    },
    inputs: request.inputs
      .map(({ flag, sha256, bytes }) => ({ flag, sha256, bytes }))
      .sort((a, b) => a.flag.localeCompare(b.flag)),
  };
}

function offerInputs(request) {
  return Object.fromEntries(request.inputs.map((inp) => [inp.key, inp.resolvedPath]));
}

function isTransportFailure(offer) {
  const transport = offer?.transport;
  if (transport && transport !== "ok" && transport !== "rejected") return true;
  const code = offer?.code;
  return (
    code === "kit-acquisition-failed" ||
    code === "engine-crash" ||
    code === "engine-timeout" ||
    code === "internal-error"
  );
}

function mapWrapperRefuse(offer, raw) {
  const code = offer?.code || "engine-refused";
  let falsifier = null;
  if (code === "sample-not-a-sale" || offer?.sample) falsifier = "F-SAMPLE";
  if (code === "missing-required-inputs" || code === "input-malformed" || code === "input-missing-file" || code === "input-schema-mismatch" || code === "input-jsonl-not-document") {
    falsifier = "F-INPUT";
  }
  const httpStatus = isTransportFailure(offer) ? 503 : 400;
  return new OrderRefuse(code, offer?.error || "D01 execution refused", {
    falsifier,
    httpStatus,
    detail: {
      contract: offer?.contract || EXECUTION_CONTRACT_PIN,
      transport: offer?.transport || null,
      analysis: offer?.analysis || null,
      delivery: offer?.delivery || null,
      executionId: offer?.executionId || null,
      orderId: raw?.orderId ?? null,
    },
  });
}

async function waitWhileHeld(store, orderId) {
  const started = Date.now();
  while (Date.now() - started < 120_000) {
    const rec = await store.get(orderId);
    if (!rec || rec.status === "complete") return rec;
    if (!pidAlive(rec.holderPid)) return rec;
    await sleep(50);
  }
  throw new OrderRefuse("reservation-timeout", "timed out waiting for in-flight order", {
    httpStatus: 504,
    detail: { orderId },
  });
}

async function acquireReservation(store, record) {
  const holderToken = randomUUID();
  for (;;) {
    const outcome = await store.reserve({ ...record, holderToken, holderPid: process.pid });
    if (outcome.kind === "held") {
      await waitWhileHeld(store, record.orderId);
      continue;
    }
    return outcome;
  }
}

function mapOutputs(offer) {
  return (offer.outputs || []).map((row) => ({
    name: row.name,
    bytes: row.bytes,
    sha256: row.sha256,
  }));
}

function buildSuccessResult({ request, pins, termsHash, offer, outDir }) {
  return {
    schema: CONSUMER_CONTRACT_SCHEMA,
    ok: true,
    orderId: request.orderId,
    engineId: request.engineId,
    archiveSha256: pins.archiveSha256,
    archiveBytes: pins.archiveBytes,
    enginePin: {
      package: pins.package,
      version: pins.version,
      sha256: pins.archiveSha256,
      bytes: pins.archiveBytes,
      cli: pins.cli,
    },
    inputs: request.inputs.map(({ flag, path, sha256, bytes }) => ({ flag, path, sha256, bytes })),
    inputSha256: request.inputs.map((inp) => inp.sha256),
    outputs: mapOutputs(offer),
    sold: false,
    charged: false,
    purchaseAuthority: false,
    schedulerDaemon: false,
    example: false,
    sample: Boolean(offer.sample),
    fundingState: request.fundingState,
    termsHash,
    termsSchema: ORDER_TERMS_SCHEMA,
    replayed: false,
    acceptanceClass: "local-runtime",
    liveCatalogItem: false,
    productionExpressRoute: false,
    competingRunner: false,
    outDir: outDir || offer.outDir || offer.runOutDir || null,
    runOutDir: offer.runOutDir || null,
    publishedDir: offer.outDir || outDir || null,
    wrapper: {
      contract: offer.contract || EXECUTION_CONTRACT_PIN,
      testedD01Sha: TESTED_D01_SHA,
      executionId: offer.executionId || null,
      transport: offer.transport || null,
      analysis: offer.analysis || null,
      delivery: offer.delivery || null,
      receipt: offer.receipt || null,
    },
  };
}

function applyFundingCheck(wrapper, raw, request) {
  if (typeof wrapper.classifyFunding === "function") {
    const funding = wrapper.classifyFunding(
      {
        funding: request.fundingState,
        fundingIntent: request.fundingState,
        payment: raw.payment && typeof raw.payment === "object" ? raw.payment : null,
        sold: raw.sold,
        settle: raw.settle,
        liveSettle: raw.liveSettle,
      },
      { sample: false },
    );
    if (funding.fundingState === "rejected") {
      throw new OrderRefuse(funding.code || "funding-rejected", funding.message || "funding rejected", {
        detail: { funding, contract: wrapper.version },
      });
    }
    return funding;
  }
  if (request.fundingState === "reserved-fixture" && !(raw.payment && typeof raw.payment === "object")) {
    throw new OrderRefuse(
      "reserved-fixture-requires-payment",
      "reserved-fixture requires a recognized fixture payment object; fundingIntent alone is not a reservation",
      { detail: { contract: wrapper.version } },
    );
  }
  return { fundingState: request.fundingState, sold: false };
}

async function createOrderStrict(raw, options = {}) {
  earlyRefuse(raw);
  const pins = options.pins || loadPins();
  const catalog = options.catalog || loadCatalog(pins.catalogPath);
  const request = normalizeRequest(raw, {
    catalog,
    pins,
    requestDir: options.requestDir || null,
  });

  if (request.enginePin.sha256 !== pins.archiveSha256 || request.enginePin.bytes !== pins.archiveBytes) {
    throw new OrderRefuse(
      "f-pin",
      "engine pin does not match the published useful-jobs archive sha256/bytes",
      {
        falsifier: "F-PIN",
        detail: {
          requested: request.enginePin,
          expected: { sha256: pins.archiveSha256, bytes: pins.archiveBytes },
        },
      },
    );
  }
  if (request.enginePin.version !== pins.version) {
    throw new OrderRefuse("f-pin", "engine pin version is not useful-jobs 1.0.0", {
      falsifier: "F-PIN",
      detail: { requested: request.enginePin.version, expected: pins.version },
    });
  }

  const extraLabeled = collectLabeledSampleDigests(join(OWNED_DIR, "fixtures/labeled-sample"));
  const sample = inspectSample(request, { extraLabeledDigests: extraLabeled });
  if (sample.sample) {
    throw new OrderRefuse(
      "sample-not-customer",
      "SAMPLE / labeled-example hashes cannot be claimed as customer work",
      { falsifier: "F-SAMPLE", detail: { reasons: sample.reasons } },
    );
  }

  for (const inp of request.inputs) {
    if (!existsSync(inp.resolvedPath)) {
      throw new OrderRefuse("missing-input-file", `input file not found for ${inp.flag}`, {
        falsifier: "F-INPUT",
        detail: { flag: inp.flag, path: inp.resolvedPath },
      });
    }
    const actual = fileDigest(inp.resolvedPath);
    if (actual.sha256 !== inp.sha256 || actual.bytes !== inp.bytes) {
      throw new OrderRefuse(
        "f-input",
        "buyer-echoed input digest does not match local file bytes",
        {
          falsifier: "F-INPUT",
          detail: { flag: inp.flag, claimed: { sha256: inp.sha256, bytes: inp.bytes }, actual },
        },
      );
    }
  }

  const terms = buildTerms(request, pins);
  const termsHash = hashTerms(terms);
  const store = options.store;
  if (!store) {
    throw new Error("createOrder requires an injected store adapter");
  }

  const wrapper = await loadExecutionContract(options);
  applyFundingCheck(wrapper, raw, request);

  const reservation = await acquireReservation(store, {
    orderId: request.orderId,
    termsHash,
    engineId: request.engineId,
    archiveSha256: pins.archiveSha256,
    request: {
      engineId: request.engineId,
      orderId: request.orderId,
      enginePin: request.enginePin,
      inputs: request.inputs.map(({ flag, path, sha256, bytes }) => ({ flag, path, sha256, bytes })),
      fundingState: request.fundingState,
    },
  });

  if (reservation.kind === "conflict") {
    throw new OrderRefuse(
      "f-order",
      "orderId is immutable; swapped files require a new orderId",
      {
        falsifier: "F-ORDER",
        httpStatus: 409,
        detail: {
          orderId: request.orderId,
          storedTermsHash: reservation.record.termsHash,
          requestedTermsHash: termsHash,
        },
      },
    );
  }
  if (reservation.kind === "replay") {
    return { ...reservation.record.result, replayed: true };
  }

  const outDir = options.outDir || mkdtempSync(join(tmpdir(), "managed-order-out-"));
  mkdirSync(outDir, { recursive: true });

  await store.recordExecution({
    orderId: request.orderId,
    termsHash,
    wrapperKind: wrapper.kind,
    contract: wrapper.version,
  });

  const offer = await wrapper.runPaidOffer({
    jobId: request.engineId,
    inputs: offerInputs(request),
    example: false,
    fundingIntent: request.fundingState,
    funding: request.fundingState,
    payment: raw.payment && typeof raw.payment === "object" ? raw.payment : undefined,
    outDir,
  });

  if (!offer?.ok) {
    const err = mapWrapperRefuse(offer, raw);
    if (isTransportFailure(offer)) {
      throw err;
    }
    const refused = formatRefuse(err, raw);
    refused.wrapper = {
      contract: offer?.contract || wrapper.version,
      testedD01Sha: TESTED_D01_SHA,
      executionId: offer?.executionId || null,
      transport: offer?.transport || null,
      analysis: offer?.analysis || null,
      delivery: offer?.delivery || null,
    };
    await store.complete(request.orderId, refused);
    return refused;
  }

  const result = buildSuccessResult({ request, pins, termsHash, offer, outDir });
  await store.complete(request.orderId, result);
  return result;
}

export async function runCreateOrder(raw, options = {}) {
  try {
    return await createOrderStrict(raw, options);
  } catch (err) {
    if (err instanceof OrderRefuse) return formatRefuse(err, raw);
    throw err;
  }
}

export function defaultFileStore(dir) {
  return createFileStore(dir);
}
