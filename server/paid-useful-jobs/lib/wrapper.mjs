import { copyFileSync, existsSync, mkdirSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getJob } from "./jobs.mjs";
import { freezeRequest, materializeInputs, WrapperRefuse } from "./input-guard.mjs";
import { inspectSample, wantsLiveSale } from "./sample-guard.mjs";
import { classifyFunding, isFixturePayment, wouldSettleIfGuardOmitted } from "./funding.mjs";
import { engineProvenance, ensureUsefulJobsKit, runEngineJob } from "./engine.mjs";
import { applyEnvelopeContinuity, declaredRouteMetadata } from "./envelope.mjs";
import { getLastIndexingContinuityDiagnostic } from "./continuity.mjs";
import { buildReceipt } from "./receipt.mjs";
import { fileEntry } from "./digest.mjs";
import {
  EXECUTION_CONTRACT_VERSION,
  assessDelivery,
  classifyAnalysis,
  classifyTransport,
} from "./contract.mjs";

export { EXECUTION_CONTRACT_VERSION };

function emptyDelivery(expected = []) {
  return assessDelivery(expected, null);
}

function rejection({
  jobId,
  code,
  message,
  detail,
  fundingState = "rejected",
  sample = false,
  sampleReasons = [],
  transport = "rejected",
  analysis = { status: "not-run", outcome: "not-run", identityVerified: null },
  delivery = emptyDelivery(),
  executionId = randomUUID(),
}) {
  return {
    ok: false,
    refused: true,
    jobId,
    code,
    error: message,
    detail: detail || null,
    fundingState,
    sold: false,
    sample,
    sampleReasons,
    purchaseAuthority: false,
    liveSettleAttempted: false,
    liveSettleAllowed: false,
    outputs: [],
    executionId,
    contract: EXECUTION_CONTRACT_VERSION,
    transport,
    analysis,
    delivery,
    receipt: {
      schema: "samedaydesk.paid-useful-jobs.receipt.v1",
      jobId,
      engine: engineProvenance(),
      fundingState,
      sold: false,
      sample,
      sampleReasons,
      purchaseAuthority: false,
      liveSettlement: "out-of-scope",
      code,
      error: message,
      contract: EXECUTION_CONTRACT_VERSION,
      transport,
      analysis,
      delivery,
    },
  };
}

function publishCompleteOutputs(runOutDir, callerOutDir, expectedNames) {
  if (!callerOutDir) return runOutDir;
  mkdirSync(callerOutDir, { recursive: true });
  for (const name of expectedNames) {
    const src = join(runOutDir, name);
    if (existsSync(src) && statSync(src).isFile()) {
      copyFileSync(src, join(callerOutDir, name));
    }
  }
  return callerOutDir;
}

function listPresentOutputs(dir, names) {
  if (!dir || !existsSync(dir)) return [];
  return names
    .filter((name) => {
      const p = join(dir, name);
      return existsSync(p) && statSync(p).isFile();
    })
    .map((name) => fileEntry(name, join(dir, name)));
}

/**
 * One execution kernel. CLI, library, and local HTTP stay thin.
 * Inject acquireKit / runEngine only in tests.
 */
export function createExecutor(deps = {}) {
  const acquireKit = deps.acquireKit || ensureUsefulJobsKit;
  const runEngine = deps.runEngine || runEngineJob;

  return async function runPaidOffer(request = {}) {
    const frozen = freezeRequest(request);
    const executionId = frozen.executionId || randomUUID();
    const jobId = frozen.jobId;
    if (!jobId) {
      return rejection({
        jobId: null,
        code: "missing-job",
        message: "jobId is required",
        executionId,
      });
    }

    let job;
    try {
      job = getJob(jobId);
    } catch (err) {
      return rejection({
        jobId,
        code: err.code || "unknown-job",
        message: err.message,
        executionId,
      });
    }

    let sampleInfo = { sample: false, reasons: [] };

    try {
      const work = mkdtempSync(join(tmpdir(), `puj-${jobId}-`));
      const runOutDir = mkdtempSync(join(tmpdir(), `puj-${jobId}-out-`));
      const materialized = materializeInputs(jobId, frozen, join(work, "inputs"));
      const example = materialized.example;

      let kit;
      try {
        kit = await Promise.resolve(acquireKit());
      } catch (err) {
        return rejection({
          jobId,
          code: "kit-acquisition-failed",
          message: err instanceof Error ? err.message : String(err),
          transport: "acquisition-failed",
          analysis: { status: "not-run", outcome: "not-run", identityVerified: null },
          delivery: emptyDelivery(job.outputs || []),
          executionId,
        });
      }

      sampleInfo = inspectSample(frozen, { kitRoot: kit, entries: materialized.entries });

      const funding = classifyFunding(frozen, { sample: sampleInfo.sample });
      if (funding.fundingState === "rejected") {
        return rejection({
          jobId,
          code: funding.code,
          message: funding.message,
          detail: { wouldSettleIfGuardOmitted: funding.wouldSettleIfGuardOmitted || false },
          sample: sampleInfo.sample,
          sampleReasons: sampleInfo.reasons,
          executionId,
        });
      }

      if (wantsLiveSale(frozen)) {
        return rejection({
          jobId,
          code: "live-sale-not-available",
          message: "Live sale is not available from this non-settling envelope",
          sample: sampleInfo.sample,
          sampleReasons: sampleInfo.reasons,
          executionId,
        });
      }

      let continuity = null;
      const payment = frozen.payment;
      if (payment && typeof payment === "object") {
        const payload = structuredClone(payment);
        const applied = await applyEnvelopeContinuity({
          jobId,
          paymentPayload: payload,
          requirements: payload.accepted || payload.requirements,
        });
        continuity = {
          declared: declaredRouteMetadata(jobId),
          provenance: getLastIndexingContinuityDiagnostic()?.provenance || null,
          filledResource: payload.resource || null,
          filledBazaar: payload.extensions?.bazaar || null,
          fixture: isFixturePayment(payment),
          wouldSettleIfGuardOmitted: wouldSettleIfGuardOmitted(
            payload,
            payload.accepted || payload.requirements || null,
          ),
        };
        void applied;
      }

      let engine;
      try {
        engine = await Promise.resolve(
          runEngine(jobId, {
            files: materialized.files,
            example,
            outDir: runOutDir,
          }),
        );
      } catch (err) {
        return rejection({
          jobId,
          code: "engine-crash",
          message: err instanceof Error ? err.message : String(err),
          fundingState: funding.fundingState,
          sample: sampleInfo.sample || example,
          sampleReasons: sampleInfo.reasons,
          transport: "engine-crash",
          analysis: { status: "not-run", outcome: "crashed", identityVerified: null },
          delivery: assessDelivery(job.outputs || [], runOutDir),
          executionId,
        });
      }

      const expected = job.outputs || [];
      const delivery = assessDelivery(expected, runOutDir);
      const transport = classifyTransport({
        acquireError: false,
        engine,
        crashed: false,
        timeout: Boolean(engine?.timedOut),
      });
      const analysis = classifyAnalysis({ engine, delivery });
      const thisRunOutputs = listPresentOutputs(runOutDir, expected);

      if (transport !== "ok") {
        const code = transport === "timeout" ? "engine-timeout" : "engine-crash";
        return {
          ok: false,
          refused: true,
          jobId,
          code,
          error: engine?.stderr?.slice(0, 400) || `engine transport ${transport}`,
          fundingState: funding.fundingState,
          sold: false,
          sample: sampleInfo.sample || example,
          sampleReasons: sampleInfo.reasons,
          purchaseAuthority: false,
          liveSettleAttempted: false,
          liveSettleAllowed: false,
          outputs: [],
          engine,
          runOutDir,
          executionId,
          contract: EXECUTION_CONTRACT_VERSION,
          transport,
          analysis,
          delivery,
          receipt: Object.assign(
            buildReceipt({
              jobId,
              kit,
              inputEntries: materialized.entries,
              outputFiles: [],
              funding,
              sample: sampleInfo.sample || example,
              sampleReasons: sampleInfo.reasons,
              engineJson: engine.json,
              continuity,
              payment,
            }),
            {
              contract: EXECUTION_CONTRACT_VERSION,
              transport,
              analysis,
              delivery,
              runOutDir,
            },
          ),
        };
      }

      if (!delivery.complete) {
        const receipt = buildReceipt({
          jobId,
          kit,
          inputEntries: materialized.entries,
          outputFiles: thisRunOutputs,
          funding,
          sample: sampleInfo.sample || example,
          sampleReasons: sampleInfo.reasons,
          engineJson: engine.json,
          continuity,
          payment,
        });
        receipt.outDir = runOutDir;
        receipt.contract = EXECUTION_CONTRACT_VERSION;
        receipt.transport = transport;
        receipt.analysis = analysis;
        receipt.delivery = delivery;
        return {
          ok: false,
          refused: true,
          jobId,
          code: "missing-output",
          error: `This run did not produce expected outputs: ${(delivery.missing || []).join(", ")}`,
          fundingState: funding.fundingState,
          sold: false,
          sample: sampleInfo.sample || example,
          sampleReasons: sampleInfo.reasons,
          purchaseAuthority: false,
          liveSettleAttempted: false,
          liveSettleAllowed: false,
          outputs: thisRunOutputs,
          engine: engine.json,
          runOutDir,
          executionId,
          contract: EXECUTION_CONTRACT_VERSION,
          transport,
          analysis,
          delivery,
          receipt,
        };
      }

      const publishedDir = publishCompleteOutputs(runOutDir, frozen.outDir, expected);
      const receipt = buildReceipt({
        jobId,
        kit,
        inputEntries: materialized.entries,
        outputFiles: thisRunOutputs,
        funding,
        sample: sampleInfo.sample || example,
        sampleReasons: sampleInfo.reasons,
        engineJson: engine.json,
        continuity,
        payment,
      });
      receipt.outDir = runOutDir;
      receipt.publishedDir = frozen.outDir || null;
      receipt.contract = EXECUTION_CONTRACT_VERSION;
      receipt.transport = transport;
      receipt.analysis = analysis;
      receipt.delivery = { ...delivery, publishedDir };
      receipt.runOutDir = runOutDir;

      return {
        ok: true,
        jobId,
        title: job.title,
        fundingState: funding.fundingState,
        sold: false,
        sample: receipt.sample,
        sampleReasons: sampleInfo.reasons,
        purchaseAuthority: false,
        outputs: thisRunOutputs,
        receipt,
        engine: engine.json,
        liveSettlement: "out-of-scope",
        executionId,
        runOutDir,
        outDir: publishedDir,
        contract: EXECUTION_CONTRACT_VERSION,
        transport,
        analysis,
        delivery: { ...delivery, publishedDir },
      };
    } catch (err) {
      if (err instanceof WrapperRefuse) {
        return rejection({
          jobId,
          code: err.code,
          message: err.message,
          detail: err.detail,
          sample: sampleInfo.sample,
          sampleReasons: sampleInfo.reasons,
          executionId,
        });
      }
      return rejection({
        jobId,
        code: "internal-error",
        message: err.message || String(err),
        sample: sampleInfo.sample,
        sampleReasons: sampleInfo.reasons,
        transport: "internal-error",
        executionId,
      });
    }
  };
}

/**
 * Paid offer adapter: caller-supplied input → existing engine → usable output + receipt.
 * Never a live sale. Fixture payments cannot call live settle.
 */
export const runPaidOffer = createExecutor();

/**
 * Isolated batch: one job's rejection never marks siblings sold.
 */
export async function runPaidOffers(requests) {
  const results = [];
  for (const request of requests) {
    results.push(await runPaidOffer(request));
  }
  return {
    ok: results.every((r) => r.ok),
    sold: false,
    results,
    anyRejected: results.some((r) => r.fundingState === "rejected" || r.refused),
  };
}
