/**
 * SameDayDesk supplied-input delivery composition.
 * preflight → managed-order → execution.v1 → artifact completeness → mailbox.
 * Isolated runOutDir is delivery identity. publishedDir is last-writer copy.
 */
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { loadCatalog, findJob } from "../../../tools/job-input-preflight/lib/catalog.mjs";
import { preflight } from "../../../tools/job-input-preflight/lib/preflight.mjs";
import { PreflightRefuse, resultFromRefuse } from "../../../tools/job-input-preflight/lib/refuse.mjs";
import { DEFAULT_CATALOG } from "../../../tools/job-input-preflight/lib/roots.mjs";
import { runCreateOrder, defaultFileStore } from "../../../tools/managed-useful-jobs-order/lib/create-order.mjs";
import { loadPins } from "../../../tools/managed-useful-jobs-order/lib/pins.mjs";
import { verifyComplete } from "../../../tools/job-output-atomicity/index.mjs";
import { CATALOG_PATH } from "../../../tools/job-output-atomicity/lib/pins.mjs";
import { seedFromD01Execution } from "../../../tools/result-mailbox/lib/d01-receipt.mjs";
import { pickup } from "../../../tools/result-mailbox/lib/pickup.mjs";
import { acknowledge } from "../../../tools/result-mailbox/lib/ack.mjs";
import { EXECUTION_CONTRACT_VERSION } from "./contract.mjs";
import { createExecutionServer, listenExecutionServer } from "./http.mjs";

const CLOCK = "2026-09-11T23:00:00Z";
const EXPIRES = "2026-09-12T23:00:00Z";

function flagsFromInputs(inputs = {}) {
  const flags = {};
  for (const [key, value] of Object.entries(inputs)) {
    if (value == null || value === false || value === "") continue;
    flags[key] = value;
  }
  return flags;
}

export async function runPreflightStage({ jobId, inputs, catalogPath = DEFAULT_CATALOG, outDir = null } = {}) {
  const catalog = await loadCatalog(catalogPath);
  const job = findJob(catalog, jobId);
  try {
    return preflight({
      catalog,
      job,
      flags: flagsFromInputs(inputs),
      outDir,
    });
  } catch (err) {
    if (err instanceof PreflightRefuse) return resultFromRefuse(err);
    throw err;
  }
}

function orderRequestFromPreflight(pre, { orderId, fundingState, payment }) {
  const pins = loadPins();
  const inputs = [];
  for (const [key, rec] of Object.entries(pre.inputs || {})) {
    if (!rec || rec.kind === "directory") continue;
    inputs.push({
      flag: rec.flag || `--${key}`,
      path: rec.stagedPath,
      sha256: rec.sha256,
      bytes: rec.bytes,
    });
  }
  return {
    engineId: pre.job,
    orderId,
    archiveSha256: pins.archiveSha256,
    archiveBytes: pins.archiveBytes,
    enginePin: {
      sha256: pins.archiveSha256,
      bytes: pins.archiveBytes,
      version: pins.version,
    },
    example: false,
    sold: false,
    purchaseAuthority: false,
    fundingState: fundingState || "unfunded",
    payment: payment || undefined,
    inputs,
  };
}

function deliveryRoot(order) {
  return order?.runOutDir || order?.wrapper?.receipt?.runOutDir || order?.wrapper?.receipt?.outDir || null;
}

/**
 * One supplied-input delivery: preflight → order/execute → completeness → mailbox.
 */
export async function deliverSuppliedInput({
  jobId,
  inputs,
  fundingState = "unfunded",
  payment = null,
  orderId = `ord-${randomUUID()}`,
  requestId = `req-${randomUUID()}`,
  mailbox = null,
  publishedDir = null,
  storeDir = null,
  store = null,
  executeUrl = null,
  http = false,
  clock = CLOCK,
  expiresAt = EXPIRES,
  pickupOut = null,
  ack = true,
} = {}) {
  let server = null;
  let origin = null;
  try {
    if (http && !executeUrl) {
      const started = createExecutionServer();
      server = started.server;
      const listened = await listenExecutionServer(server);
      origin = listened.origin;
      executeUrl = origin;
    }

    const preOut = mkdtempSync(join(tmpdir(), "sds-deliver-pre-"));
    const preflightResult = await runPreflightStage({ jobId, inputs, outDir: preOut });
    if (!preflightResult?.ok) {
      return {
        ok: false,
        stage: "preflight",
        contract: EXECUTION_CONTRACT_VERSION,
        preflight: preflightResult,
        sold: false,
      };
    }

    const orderStore = store || defaultFileStore(storeDir || mkdtempSync(join(tmpdir(), "sds-deliver-store-")));
    const published = publishedDir || mkdtempSync(join(tmpdir(), "sds-deliver-pub-"));
    mkdirSync(published, { recursive: true });
    const mailboxDir = mailbox || mkdtempSync(join(tmpdir(), "sds-deliver-mail-"));

    const raw = orderRequestFromPreflight(preflightResult, { orderId, fundingState, payment });
    const order = await runCreateOrder(rawWithPayment(raw, payment), {
      store: orderStore,
      outDir: published,
      executeUrl,
    });

    if (!order?.ok) {
      return {
        ok: false,
        stage: "order",
        contract: EXECUTION_CONTRACT_VERSION,
        preflight: preflightResult,
        order,
        sold: false,
        executeUrl: origin || executeUrl || null,
      };
    }

    const runOutDir = deliveryRoot(order);
    const completeness = verifyComplete({
      root: runOutDir,
      catalogPath: CATALOG_PATH,
      evidenceClass: "local-runtime",
    });

    if (!completeness?.ok) {
      return {
        ok: false,
        stage: "completeness",
        contract: EXECUTION_CONTRACT_VERSION,
        preflight: preflightResult,
        order,
        completeness,
        runOutDir,
        publishedDir: published,
        sold: false,
      };
    }

    const execution = {
      ok: true,
      jobId,
      contract: order.wrapper?.contract || EXECUTION_CONTRACT_VERSION,
      transport: order.wrapper?.transport,
      analysis: order.wrapper?.analysis,
      delivery: order.wrapper?.delivery,
      outputs: order.outputs,
      receipt: order.wrapper?.receipt,
      sample: order.sample === true,
      sampleReasons: order.wrapper?.receipt?.sampleReasons || [],
      engine: order.wrapper?.receipt?.engine,
      runOutDir,
      executionId: order.wrapper?.executionId || null,
      sold: false,
    };

    const seeded = seedFromD01Execution({
      mailbox: mailboxDir,
      requestId,
      execution,
      outDir: runOutDir,
      clock,
      expiresAt,
    });

    const pickupDir = pickupOut || mkdtempSync(join(tmpdir(), "sds-deliver-pick-"));
    const picked = pickup({
      mailbox: mailboxDir,
      requestId,
      outDir: pickupDir,
      clock,
    });

    let acked = null;
    if (ack && picked?.ok) {
      acked = acknowledge({ mailbox: mailboxDir, requestId, clock });
    }

    return {
      ok: Boolean(seeded?.ok && picked?.ok && completeness.ok && order.ok && (!ack || acked?.ok)),
      stage: "mailbox",
      contract: EXECUTION_CONTRACT_VERSION,
      preflight: { ok: true, job: preflightResult.job, stagedDir: preflightResult.stagedDir },
      order,
      completeness,
      mailbox: { seeded, pickup: picked, ack: acked, dir: mailboxDir, requestId },
      runOutDir,
      publishedDir: published,
      executeUrl: origin || executeUrl || null,
      sold: false,
    };
  } finally {
    if (server) await new Promise((resolveClose) => server.close(() => resolveClose()));
  }
}

function rawWithPayment(raw, payment) {
  if (!payment) return raw;
  return { ...raw, payment };
}

export async function deliverDisjointSecondJob(firstOpts, secondInputs) {
  let server = null;
  let executeUrl = firstOpts.executeUrl || null;
  if (firstOpts.http && !executeUrl) {
    const started = createExecutionServer();
    server = started.server;
    const listened = await listenExecutionServer(server);
    executeUrl = listened.origin;
  }
  try {
    const storeDir = firstOpts.storeDir || mkdtempSync(join(tmpdir(), "sds-deliver-store-pair-"));
    const mailbox = firstOpts.mailbox || mkdtempSync(join(tmpdir(), "sds-deliver-mail-pair-"));
    const first = await deliverSuppliedInput({
      ...firstOpts,
      storeDir,
      mailbox,
      http: false,
      executeUrl,
      orderId: firstOpts.orderId || `ord-a-${randomUUID()}`,
      requestId: firstOpts.requestId || `req-a-${randomUUID()}`,
    });
    const second = await deliverSuppliedInput({
      ...firstOpts,
      inputs: secondInputs,
      storeDir,
      mailbox,
      publishedDir: mkdtempSync(join(tmpdir(), "sds-deliver-pub-b-")),
      orderId: `ord-b-${randomUUID()}`,
      requestId: `req-b-${randomUUID()}`,
      http: false,
      executeUrl,
    });
    const disjoint = Boolean(
      first.mailbox?.requestId &&
        second.mailbox?.requestId &&
        first.mailbox.requestId !== second.mailbox.requestId &&
        first.runOutDir &&
        second.runOutDir &&
        first.runOutDir !== second.runOutDir,
    );
    return {
      ok: Boolean(first.ok && second.ok && disjoint),
      first,
      second,
      disjoint,
      executeUrl,
      sold: false,
      contract: EXECUTION_CONTRACT_VERSION,
    };
  } finally {
    if (server) await new Promise((resolveClose) => server.close(() => resolveClose()));
  }
}
