import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OrderRefuse, formatRefuse } from "./errors.mjs";
import { loadCatalog, jobById } from "./catalog.mjs";
import { hasOrderId, normalizeRequest } from "./contract.mjs";
import { sha256Bytes, hashTerms } from "./digest.mjs";
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
      package: request.enginePin.package || pins.package,
      version: request.enginePin.version,
      sha256: request.enginePin.sha256,
      bytes: request.enginePin.bytes,
    },
    inputs: request.inputs
      .filter((inp) => inp.kind !== "directory")
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
  if (code === "missing-required-inputs" || code === "input-malformed" || code === "input-missing-file" || code === "input-schema-mismatch" || code === "input-jsonl-not-document" || code === "html-input" || code === "package-json-only" || code === "not-this-job-openapi" || code === "unsupported_catalog" || code === "unrecognized_batch_artifact" || code === "live_fetch_url" || code === "input_bounds") {
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

function invalidExecutionResult(offer, { request, job, executionId, contract }) {
  if (!offer?.ok) return null;
  const complete = (value) => value?.transport === "ok" && value?.delivery?.complete === true;
  if (offer.contract !== contract || offer.jobId !== request.engineId || offer.executionId !== executionId || !complete(offer)) {
    return "execution contract, job, identity or completion does not match this order";
  }
  const receipt = offer.receipt;
  if (!receipt || receipt.contract !== contract || receipt.jobId !== request.engineId || !complete(receipt) ||
      (receipt.executionId != null && receipt.executionId !== executionId)) {
    return "nested receipt contradicts this order or is incomplete";
  }
  if (receipt.engine?.archiveSha256 !== request.enginePin.sha256 || receipt.engine?.archiveBytes !== request.enginePin.bytes) {
    return "nested receipt engine pin does not match this order";
  }
  const expected = job.outputs || [];
  const rows = offer.outputs;
  const nested = receipt.outputs;
  const validRows = (list) => Array.isArray(list) && list.length === expected.length &&
    new Set(list.map((r) => r?.name)).size === expected.length &&
    list.every((r) => r && expected.includes(r.name) && Number.isSafeInteger(r.bytes) && r.bytes >= 0 && /^[a-f0-9]{64}$/.test(r.sha256 || ""));
  if (!validRows(rows) || !validRows(nested) || rows.some((r) => !nested.some((n) => n.name === r.name && n.bytes === r.bytes && n.sha256 === r.sha256))) {
    return "output identities are missing, wrong for this job or contradictory";
  }
  return null;
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
    archiveSha256: request.enginePin.sha256,
    archiveBytes: request.enginePin.bytes,
    enginePin: {
      package: request.enginePin.package || pins.package,
      version: request.enginePin.version,
      sha256: request.enginePin.sha256,
      bytes: request.enginePin.bytes,
      cli: pins.cli,
    },
    inputs: request.inputs.map(({ flag, path, sha256, bytes, kind }) => ({ flag, path, sha256, bytes, kind })),
    inputSha256: request.inputs.filter((inp) => inp.kind !== "directory").map((inp) => inp.sha256),
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
  const job = jobById(catalog, request.engineId);
  const expectedPin = job?.enginePin?.sha256
    ? {
        sha256: job.enginePin.sha256,
        bytes: job.enginePin.bytes,
        version: job.enginePin.version,
        package: job.enginePin.package || pins.package,
      }
    : {
        sha256: pins.archiveSha256,
        bytes: pins.archiveBytes,
        version: pins.version,
        package: pins.package,
      };

  if (request.enginePin.sha256 !== expectedPin.sha256 || request.enginePin.bytes !== expectedPin.bytes) {
    throw new OrderRefuse(
      "f-pin",
      "engine pin does not match the catalog engine identity",
      {
        falsifier: "F-PIN",
        detail: {
          requested: request.enginePin,
          expected: expectedPin,
        },
      },
    );
  }
  if (request.enginePin.version !== expectedPin.version) {
    throw new OrderRefuse("f-pin", "engine pin version does not match the catalog engine identity", {
      falsifier: "F-PIN",
      detail: { requested: request.enginePin.version, expected: expectedPin.version },
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

  const frozenBytes = {};
  for (const inp of request.inputs) {
    if (!existsSync(inp.resolvedPath)) {
      throw new OrderRefuse("missing-input-file", `input file not found for ${inp.flag}`, {
        falsifier: "F-INPUT",
        detail: { flag: inp.flag, path: inp.resolvedPath },
      });
    }
    if (inp.kind === "directory") continue;
    const buffer = readFileSync(inp.resolvedPath);
    const actual = { sha256: sha256Bytes(buffer), bytes: buffer.length };
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
    frozenBytes[inp.key] = buffer;
    if (inp.key === "job-before") frozenBytes["job:before"] = buffer;
    if (inp.key === "job-after") frozenBytes["job:after"] = buffer;
  }

  // Bind the executed bytes to the same bytes admitted into immutable terms.
  // Do not let caller overrides or a later filesystem mutation change execution.
  for (const [key, value] of Object.entries(raw.fileBytes || {})) {
    const bound = frozenBytes[key];
    const provided = Buffer.isBuffer(value) || value instanceof Uint8Array
      ? Buffer.from(value)
      : typeof value === "string" ? Buffer.from(value)
        : value?.type === "Buffer" && Array.isArray(value.data) && value.data.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
          ? Buffer.from(value.data) : null;
    if (!bound || !provided || !bound.equals(provided)) {
      throw new OrderRefuse("f-input", "fileBytes must match a declared and verified input", {
        falsifier: "F-INPUT", detail: { key },
      });
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
    archiveSha256: request.enginePin.sha256,
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

  const priorExecutions = Number(reservation.record?.executionCount || 0);
  if (reservation.kind === "adopt" && priorExecutions > 0) {
    const interrupted = new OrderRefuse(
      "interrupted-incomplete",
      "order already recorded an engine execution that never completed; refusing a second engine run",
      {
        httpStatus: 409,
        falsifier: "F-ORDER",
        detail: {
          orderId: request.orderId,
          executionCount: priorExecutions,
        },
      },
    );
    const refused = formatRefuse(interrupted, raw);
    refused.wrapper = {
      contract: wrapper.version || EXECUTION_CONTRACT_PIN,
      testedD01Sha: TESTED_D01_SHA,
      executionId: reservation.record.inFlightExecutionId || null,
      transport: null,
      analysis: null,
      delivery: { complete: false },
    };
    await store.complete(request.orderId, refused);
    return refused;
  }

  const outDir = options.outDir || mkdtempSync(join(tmpdir(), "managed-order-out-"));
  mkdirSync(outDir, { recursive: true });

  const executionId = raw.executionId || randomUUID();
  await store.recordExecution({
    orderId: request.orderId,
    termsHash,
    wrapperKind: wrapper.kind,
    contract: wrapper.version,
    executionId,
  });

  let offer;
  try {
    offer = await wrapper.runPaidOffer({
      jobId: request.engineId,
      inputs: offerInputs(request),
      fileBytes: frozenBytes,
      example: false,
      fundingIntent: request.fundingState,
      funding: request.fundingState,
      payment: raw.payment && typeof raw.payment === "object" ? raw.payment : undefined,
      outDir,
      executionId,
    });
  } catch (err) {
    if (wrapper.executeUrl && executionId) {
      try {
        const recovered = await fetch(`${String(wrapper.executeUrl).replace(/\/$/, "")}/results/${encodeURIComponent(executionId)}`);
        if (recovered.ok) offer = await recovered.json();
      } catch {
        offer = null;
      }
    }
    if (!offer) {
      const failed = formatRefuse(
        new OrderRefuse(err.code || "engine-crash", err.message || "execution failed", {
          httpStatus: 503,
          detail: { executionId, orderId: request.orderId },
        }),
        raw,
      );
      failed.wrapper = { executionId, contract: wrapper.version, testedD01Sha: TESTED_D01_SHA };
      await store.complete(request.orderId, failed);
      return failed;
    }
  }

  const contradiction = invalidExecutionResult(offer, {
    request, job, executionId, contract: wrapper.version || EXECUTION_CONTRACT_PIN,
  });
  if (contradiction) {
    offer = { ok: false, code: "invalid-execution-result", error: contradiction,
      contract: wrapper.version || EXECUTION_CONTRACT_PIN, executionId,
      transport: "engine-crash", delivery: { complete: false } };
  }
  if (!offer?.ok) {
    const err = mapWrapperRefuse(offer, raw);
    const refused = formatRefuse(err, raw);
    refused.wrapper = {
      contract: offer?.contract || wrapper.version,
      testedD01Sha: TESTED_D01_SHA,
      executionId: offer?.executionId || executionId,
      transport: offer?.transport || null,
      analysis: offer?.analysis || null,
      delivery: offer?.delivery || null,
    };
    await store.complete(request.orderId, refused);
    if (isTransportFailure(offer)) refused.httpStatus = refused.httpStatus || 503;
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
