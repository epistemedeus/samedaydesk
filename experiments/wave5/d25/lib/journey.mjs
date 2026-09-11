import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { D01_SHA, D25_ROOT, FIRST_OFFER, QA } from "./repo.mjs";
import { startPublicOrigin } from "./public-http.mjs";
import { discoverOffer } from "./offer.mjs";
import { reservedFixturePaymentPath, runPaidCli } from "./execute.mjs";
import { classifyResult } from "./classify.mjs";
import { assertChanged, assertNotPreviousOutput, freezeInputs } from "./freeze.mjs";
import { runD09Bind } from "./binder.mjs";

const fixtures = join(D25_ROOT, "fixtures/owner-qa");
export const OWNER_QA_BUDGET = {
  before: join(fixtures, "vendor-budget-impact/before.json"),
  after: join(fixtures, "vendor-budget-impact/after.json"),
  afterReturn: join(fixtures, "vendor-budget-impact/after-return.json"),
};
export const OWNER_QA_REPEAT = {
  nextRun: join(fixtures, "repeat/next-run.json"),
  inputRoot: join(fixtures, "repeat/input-root"),
};

function jobStep({ name, jobId, run, advertised, expectedKind }) {
  const body = run.parsed.body;
  const outDir = body?.receipt?.outDir || null;
  const classified = classifyResult({
    proc: run.proc,
    parsed: run.parsed,
    advertised,
    outDir,
  });
  return {
    name,
    jobId,
    processStatus: run.proc.status,
    parseable: run.parsed.parseable,
    ok: body?.ok === true,
    sold: body?.sold === true,
    sample: body?.sample === true,
    fundingState: body?.fundingState || null,
    inputsDigest: body?.receipt?.inputsDigest || null,
    outputsDigest: body?.receipt?.outputsDigest || null,
    outputs: body?.outputs || [],
    outDir,
    classified,
    expectedKind,
    matchesExpected: classified.kind === expectedKind,
  };
}

export async function runOwnerQaJourney({ outBase, jobId = FIRST_OFFER } = {}) {
  const work = outBase || mkdtempSync(join(tmpdir(), "w5-d25-journey-"));
  const job1Out = join(work, "job1");
  const ticketOut = join(work, "repeat-ticket");
  const binderOut = join(work, "d09-bind");
  const job2Out = join(work, "job2");
  mkdirSync(job1Out, { recursive: true });
  mkdirSync(ticketOut, { recursive: true });
  mkdirSync(binderOut, { recursive: true });
  mkdirSync(job2Out, { recursive: true });

  const http = await startPublicOrigin();
  try {
    const offer = await discoverOffer(http.origin, jobId);
    const advertised = offer.outputs;

    const job1 = runPaidCli({
      jobId,
      inputs: { before: OWNER_QA_BUDGET.before, after: OWNER_QA_BUDGET.after },
      funding: "reserved-fixture",
      paymentPath: reservedFixturePaymentPath(),
      outDir: job1Out,
    });
    const step1 = jobStep({
      name: "job1-supplied-input",
      jobId,
      run: job1,
      advertised,
      expectedKind: "analysis-change",
    });

    const ticketRun = runPaidCli({
      jobId: "repeat-job-record",
      inputs: { "next-run": OWNER_QA_REPEAT.nextRun, "input-root": OWNER_QA_REPEAT.inputRoot },
      outDir: ticketOut,
    });
    const ticketStep = jobStep({
      name: "repeat-job-record",
      jobId: "repeat-job-record",
      run: ticketRun,
      advertised: ["repeat-job.json", "repeat-job.md"],
      expectedKind: "analysis-change",
    });

    const returnRoot = join(work, "return-inputs");
    mkdirSync(returnRoot, { recursive: true });
    const returnBefore = join(returnRoot, "before.json");
    const returnAfter = join(returnRoot, "after.json");
    copyFileSync(OWNER_QA_BUDGET.before, returnBefore);
    copyFileSync(OWNER_QA_BUDGET.afterReturn, returnAfter);
    const previous = freezeInputs({
      before: OWNER_QA_BUDGET.before,
      after: OWNER_QA_BUDGET.after,
    });
    const current = freezeInputs({ before: returnBefore, after: returnAfter });
    const changed = assertChanged(previous, current, "after");
    const notReuse = assertNotPreviousOutput(current, step1.outputs);

    const ticketPath = join(ticketOut, "repeat-job.json");
    const bind = runD09Bind({
      ticket: ticketPath,
      before: returnBefore,
      after: returnAfter,
      declareAfterSha256: current.after.sha256,
      outDir: binderOut,
      inputRoot: returnRoot,
    });

    const job2 = runPaidCli({
      jobId,
      inputs: { before: returnBefore, after: returnAfter },
      funding: "reserved-fixture",
      paymentPath: reservedFixturePaymentPath(),
      outDir: job2Out,
    });
    const step2 = jobStep({
      name: "job2-return",
      jobId,
      run: job2,
      advertised,
      expectedKind: "analysis-change",
    });

    const twoJobsComplete =
      step1.classified.kind === "analysis-change" &&
      step1.classified.complete &&
      step1.processStatus === 0 &&
      step2.classified.kind === "analysis-change" &&
      step2.classified.complete &&
      step2.processStatus === 0 &&
      step1.inputsDigest !== step2.inputsDigest &&
      step1.outputsDigest !== step2.outputsDigest &&
      notReuse.ok &&
      changed.ok &&
      offer.advertised;

    const result = {
      ok: twoJobsComplete,
      qa: QA,
      tested: {
        D01: D01_SHA,
        D09: bind.binder.sha,
        M01: "catalog@PR52-aeef964",
      },
      offer: {
        origin: http.origin,
        advertised: offer.advertised,
        jobId,
        catalogJobs: offer.catalogJobs,
        listedJobs: offer.listedJobs,
        purchaseAuthority: offer.purchaseAuthority,
        liveSettlement: offer.liveSettlement,
        outputs: advertised,
      },
      job1: step1,
      ticket: ticketStep,
      freeze: { previous, current, changed, notReuse },
      d09: {
        processStatus: bind.proc.status,
        parseable: bind.parsed.parseable,
        body: bind.parsed.body,
        binderSha: bind.binder.sha,
        source: bind.binder.source,
        outDir: binderOut,
        remainingBinding:
          "D09 still executes PR51 useful-jobs CLI itself. Paid delivery for the return job is D01 CLI, not binder engine/ artifacts. Unlike D01 receipt (no termsVersion) and D09 second-run termsVersion hashes are not forced equal.",
      },
      job2: step2,
      twoJobsComplete,
      work,
    };
    writeFileSync(join(work, "journey.json"), `${JSON.stringify(result, null, 2)}\n`);
    return result;
  } finally {
    await http.stop();
  }
}

export function ownerQaFixtureDir() {
  return fixtures;
}
