import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OrderRefuse, formatRefuse } from "./errors.mjs";
import { loadCatalog } from "./catalog.mjs";
import { hasOrderId, normalizeRequest } from "./contract.mjs";
import { fileDigest, hashTerms } from "./digest.mjs";
import { createUsefulJobsEngine } from "./engine.mjs";
import { findExtractUrl } from "./extract-guard.mjs";
import { ensureUsefulJobsKit, verifyArchiveFile } from "./kit.mjs";
import { CONSUMER_CONTRACT_SCHEMA, ORDER_TERMS_SCHEMA, OWNED_DIR, loadPins } from "./pins.mjs";
import { inspectSample, collectLabeledSampleDigests } from "./sample-guard.mjs";
import { createFileStore } from "./store-file.mjs";

function earlyRefuse(raw) {
  const extractHit = findExtractUrl(raw);
  if (extractHit) {
    throw new OrderRefuse(
      "f-extract",
      "request targets extract URL; this runner is not GET /extract and does not change extract 0.005 USDC",
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
      "Wave 4 payments are nonsettling prototypes; sold and charged stay false",
      { falsifier: "F-DEMAND" },
    );
  }
  if (raw?.schedulerDaemon === true) {
    throw new OrderRefuse("f-daemon", "schedulerDaemon stays false; repeat-job-record is not a daemon", {
      falsifier: "F-DAEMON",
    });
  }
}

function buildTerms(request, pins) {
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

  verifyArchiveFile(pins);

  const extraLabeled = collectLabeledSampleDigests(join(OWNED_DIR, "fixtures/labeled-sample"));
  const sample = inspectSample(request, {
    kitRoot: options.kitRoot || null,
    extraLabeledDigests: extraLabeled,
  });
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

  const existing = await store.get(request.orderId);
  if (existing) {
    if (existing.termsHash !== termsHash) {
      throw new OrderRefuse(
        "f-order",
        "orderId is immutable; swapped files require a new orderId",
        {
          falsifier: "F-ORDER",
          httpStatus: 409,
          detail: {
            orderId: request.orderId,
            storedTermsHash: existing.termsHash,
            requestedTermsHash: termsHash,
          },
        },
      );
    }
    return { ...existing.result, replayed: true };
  }

  const kit = options.kitRoot || ensureUsefulJobsKit(pins);
  const kitSample = inspectSample(request, { kitRoot: kit, extraLabeledDigests: extraLabeled });
  if (kitSample.sample) {
    throw new OrderRefuse(
      "sample-not-customer",
      "SAMPLE / labeled-example hashes cannot be claimed as customer work",
      { falsifier: "F-SAMPLE", detail: { reasons: kitSample.reasons } },
    );
  }

  const outDir = options.outDir || mkdtempSync(join(tmpdir(), "managed-order-out-"));
  mkdirSync(outDir, { recursive: true });
  const engine = options.engine || createUsefulJobsEngine({ kit, pins });
  const run = await engine.run({
    engineId: request.engineId,
    inputs: request.inputs,
    outDir,
    example: false,
  });
  if (!run.ok) {
    throw new OrderRefuse("engine-refused", run.error || "useful-jobs CLI refused", {
      detail: {
        status: run.status,
        json: run.json,
        stderr: String(run.stderr || "").slice(0, 800),
      },
    });
  }

  const outputs = [];
  for (const name of request.outputs) {
    const path = join(outDir, name);
    if (!existsSync(path)) {
      throw new OrderRefuse("missing-catalog-output", `engine did not write catalog output ${name}`, {
        detail: { outDir, name },
      });
    }
    const actual = fileDigest(path);
    outputs.push({ name, bytes: actual.bytes, sha256: actual.sha256 });
  }

  const result = {
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
    outputs,
    sold: false,
    charged: false,
    purchaseAuthority: false,
    schedulerDaemon: false,
    example: false,
    sample: false,
    fundingState: request.fundingState,
    termsHash,
    replayed: false,
    acceptanceClass: "local-runtime",
    liveCatalogItem: false,
    productionExpressRoute: false,
    outDir,
  };

  const put = await store.put({
    orderId: request.orderId,
    termsHash,
    engineId: request.engineId,
    archiveSha256: pins.archiveSha256,
    request: {
      engineId: request.engineId,
      orderId: request.orderId,
      enginePin: request.enginePin,
      inputs: result.inputs,
      fundingState: request.fundingState,
    },
    result,
  });
  if (put.replayed) {
    return { ...put.record.result, replayed: true };
  }
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
