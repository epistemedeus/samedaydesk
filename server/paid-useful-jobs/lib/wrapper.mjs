import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getJob } from "./jobs.mjs";
import { materializeInputs, refuse, WrapperRefuse } from "./input-guard.mjs";
import { inspectSample, wantsLiveSale } from "./sample-guard.mjs";
import { classifyFunding, isFixturePayment, wouldSettleIfGuardOmitted } from "./funding.mjs";
import { engineProvenance, ensureUsefulJobsKit, runEngineJob } from "./engine.mjs";
import { applyEnvelopeContinuity, declaredRouteMetadata } from "./envelope.mjs";
import { getLastIndexingContinuityDiagnostic } from "./continuity.mjs";
import { buildReceipt } from "./receipt.mjs";
import { fileEntry } from "./digest.mjs";

function rejection({ jobId, code, message, detail, fundingState = "rejected", sample = false, sampleReasons = [] }) {
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
    },
  };
}

/**
 * Paid offer adapter: caller-supplied input → existing engine → usable output + receipt.
 * Never a live sale. Fixture payments cannot call live settle.
 */
export async function runPaidOffer(request = {}) {
  const jobId = request.jobId;
  if (!jobId) {
    return rejection({ jobId: null, code: "missing-job", message: "jobId is required" });
  }

  let job;
  try {
    job = getJob(jobId);
  } catch (err) {
    return rejection({ jobId, code: err.code || "unknown-job", message: err.message });
  }

  const kit = ensureUsefulJobsKit();
  const sampleInfo = inspectSample(request, { kitRoot: kit });

  try {
    const funding = classifyFunding(request, { sample: sampleInfo.sample });
    if (funding.fundingState === "rejected") {
      return rejection({
        jobId,
        code: funding.code,
        message: funding.message,
        detail: { wouldSettleIfGuardOmitted: funding.wouldSettleIfGuardOmitted || false },
        sample: sampleInfo.sample,
        sampleReasons: sampleInfo.reasons,
      });
    }

    if (wantsLiveSale(request)) {
      return rejection({
        jobId,
        code: "live-sale-not-available",
        message: "Live sale is not available from this non-settling envelope",
        sample: sampleInfo.sample,
        sampleReasons: sampleInfo.reasons,
      });
    }

    const work = mkdtempSync(join(tmpdir(), `puj-${jobId}-`));
    const outDir = request.outDir || join(work, "out");
    mkdirSync(outDir, { recursive: true });

    const materialized = materializeInputs(jobId, request, join(work, "inputs"));
    const example = materialized.example;

    let continuity = null;
    const payment = request.payment;
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

    const engine = runEngineJob(jobId, {
      files: materialized.files,
      example,
      outDir,
    });

    if (engine.status !== 0 || !engine.json || engine.json.ok === false) {
      return {
        ok: false,
        refused: true,
        jobId,
        code: engine.json?.code || "engine-refused",
        error: engine.json?.error || engine.stderr || "engine refused",
        fundingState: funding.fundingState,
        sold: false,
        sample: sampleInfo.sample || example,
        sampleReasons: sampleInfo.reasons,
        purchaseAuthority: false,
        engine,
        receipt: buildReceipt({
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
      };
    }

    const outputFiles = job.outputs
      .map((name) => ({ name, path: join(outDir, name) }))
      .filter((f) => existsSync(f.path));

    const receipt = buildReceipt({
      jobId,
      kit,
      inputEntries: materialized.entries,
      outputFiles,
      funding,
      sample: sampleInfo.sample || example,
      sampleReasons: sampleInfo.reasons,
      engineJson: engine.json,
      continuity,
      payment,
    });
    receipt.outDir = outDir;

    return {
      ok: true,
      jobId,
      title: job.title,
      fundingState: funding.fundingState,
      sold: false,
      sample: receipt.sample,
      sampleReasons: sampleInfo.reasons,
      purchaseAuthority: false,
      outputs: outputFiles.map((f) => fileEntry(f.name, f.path)),
      receipt,
      engine: engine.json,
      liveSettlement: "out-of-scope",
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
      });
    }
    return rejection({
      jobId,
      code: "internal-error",
      message: err.message || String(err),
      sample: sampleInfo.sample,
      sampleReasons: sampleInfo.reasons,
    });
  }
}

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
