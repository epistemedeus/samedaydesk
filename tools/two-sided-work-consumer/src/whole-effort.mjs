import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { WHOLE_EFFORT_SCHEMA, capabilityStamp } from "./constants.mjs";
import { acceptWork, claimWork, deliverWork, postWork, projectFeeWork, proveWork } from "./commands.mjs";
import { feeModule, repoRoot, reuseCli, teCli } from "./paths.mjs";
import { containsPrivateAtom } from "./public.mjs";
import { rewardFreeRecord } from "./reuse-bridge.mjs";
import { bundleFromJourney } from "./te-bridge.mjs";
import { readJourney } from "./store.mjs";

const ARTIFACT = {
  schema: "pilot.task-bundle-economics.structured-extract.v1",
  artifactClass: "bounded_structured_extract",
  heading: "Example Domain",
  headingDigest: "heading-accepted",
  sourceLabel: "synthetic-page",
};

function fail(reason, extra = {}) {
  return { ok: false, reason, ...capabilityStamp(), ...extra, pricingInvented: false };
}

export function scenarioInput(scenario) {
  const post = {
    taskId: "heading-extract",
    title: "Extract public heading",
    summary: "Collect the public heading text into a bounded structured extract.",
    requesterId: "requester-1",
    criteria: ["public-heading"],
    objectiveCriteria: {
      "public-heading": {
        check: "digest_match",
        observe: "headingDigest",
        expected: "heading-accepted",
      },
    },
    payableKinds: ["usable"],
    publicationConsent: true,
    provenance: "synthetic",
    termsDigest: "terms-heading-extract",
    rightsDigest: "rights-heading-extract",
    requesterNote: "Synthetic consented work. Not market liquidity.",
    costLines: [
      { kind: "rail", status: "measured", atomic: "0" },
      { kind: "review", status: "unknown" },
      { kind: "support", status: "unknown" },
      { kind: "contributor", status: "unknown" },
    ],
  };
  if (scenario === "unauthorized") {
    post.terms = { feeBps: 100, feeBasis: "new_job_gross" };
    post.grossAtomic = "2000000";
    post.railCostAtomic = "0";
  } else if (scenario === "unknown") {
    post.terms = { feeBps: 500, feeBasis: "new_job_gross" };
  } else {
    post.terms = { feeBps: 500, feeBasis: "new_job_gross" };
    post.grossAtomic = "2000000";
    post.railCostAtomic = "0";
    post.effort = { measured: true, directCostAtomic: "100000", bundledShareAtomic: "100000" };
  }
  return post;
}

function runNode(args) {
  const started = process.hrtime.bigint();
  const result = spawnSync(process.execPath, args, { cwd: repoRoot, encoding: "utf8" });
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, elapsedMs: Math.round(elapsedMs) };
}

function parseStdout(result) {
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

export function measureWholeEffort({ clock, scenario = "authorized", workdir } = {}) {
  if (scenario !== "authorized" && scenario !== "unknown" && scenario !== "unauthorized") {
    return fail("scenario_refused");
  }
  const root = workdir || mkdtempSync(join(tmpdir(), "two-sided-effort-"));
  const journeyPath = join(root, "journey.json");
  const env = { journeyPath, clock };
  const composedSteps = [];
  const record = (name, result) => {
    composedSteps.push({ name, ok: result.ok === true, reason: result.reason });
    return result;
  };
  const posted = record("post", postWork(scenarioInput(scenario), env));
  if (!posted.ok) return fail("composed_step_failed", { step: "post", result: posted });
  const claimed = record("claim", claimWork({ taskId: "heading-extract", holderId: "agent-a" }, env));
  if (!claimed.ok) return fail("composed_step_failed", { step: "claim", result: claimed });
  const delivered = record("deliver", deliverWork({
    taskId: "heading-extract",
    holderId: "agent-a",
    expectedRevision: 0,
    artifact: ARTIFACT,
    citedEvidence: [{ source: "synthetic-page", locator: "headingDigest", digest: "heading-accepted" }],
  }, env));
  if (!delivered.ok) return fail("composed_step_failed", { step: "deliver", result: delivered });
  const accepted = record("accept", acceptWork({
    taskId: "heading-extract",
    requesterId: "requester-1",
    decision: "accept",
  }, env));
  if (!accepted.ok) return fail("composed_step_failed", { step: "accept", result: accepted });
  const proved = record("proof", proveWork({
    taskId: "heading-extract",
    requesterId: "requester-1",
    subject: "heading-extract-proof",
    sequence: 1,
    optIn: true,
  }, env));
  if (!proved.ok) return fail("composed_step_failed", { step: "proof", result: proved });
  const projected = record("project-fee", projectFeeWork({
    taskId: "heading-extract",
    requesterId: "requester-1",
  }, env));
  if (!projected.ok) return fail("composed_step_failed", { step: "project-fee", result: projected });

  const stored = readJourney(journeyPath);
  if (!stored.ok) return fail(stored.reason);
  const bundle = bundleFromJourney(stored.journey);
  if (bundle.tasks[0].delivery) {
    bundle.tasks[0].delivery.acquisition = {
      processId: "task-bundle-economics-cli",
      processKind: "separate_cli_process",
    };
  }
  const bundlePath = join(root, "bundle.json");
  writeFileSync(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`);
  const diagnose = runNode([teCli, "diagnose", "--input", bundlePath]);
  const compare = runNode([teCli, "compare", "--input", bundlePath]);
  const diagnoseBody = parseStdout(diagnose);
  const compareBody = parseStdout(compare);
  const recordPath = join(root, "reuse-record.json");
  writeFileSync(recordPath, `${JSON.stringify(rewardFreeRecord(stored.journey), null, 2)}\n`);
  const reuseOut = join(root, "reuse-observation.json");
  const reuse = runNode([
    reuseCli,
    "export",
    "--input",
    recordPath,
    "--task-id",
    "heading-extract",
    "--subject",
    "heading-extract-proof",
    "--sequence",
    "1",
    "--clock",
    clock,
    "--opt-in",
    "--out",
    reuseOut,
  ]);
  const reuseBody = parseStdout(reuse);

  const projection = projected.projection;
  let feeStep;
  if (projection.authorized && typeof projection.grossAtomic === "string") {
    const scriptPath = join(root, "direct-fee.mjs");
    const feeUrl = pathToFileURL(feeModule).href;
    writeFileSync(scriptPath, `import { FEE_BPS, quoteEconomics } from ${JSON.stringify(feeUrl)};
const gross = process.argv[2];
const rail = process.argv[3];
const quote = quoteEconomics({ gross, railCost: rail, captures: [gross] });
process.stdout.write(JSON.stringify({ ok: true, FEE_BPS, platformFeeAtomic: quote.platformFeeAtomic, contributorNetAtomic: quote.contributorNetAtomic, feeBasis: quote.feeBasis }));
`);
    feeStep = runNode([scriptPath, projection.grossAtomic, stored.journey.task.railCostAtomic || "0"]);
  } else {
    feeStep = {
      status: 0,
      skipped: true,
      reason: projection.feeReadout,
      quoteNotCalled: true,
      elapsedMs: 0,
      stdout: "",
      stderr: "",
    };
  }
  const feeBody = feeStep.skipped ? null : parseStdout(feeStep);

  const directEvidence = diagnoseBody?.tasks?.[0]?.evidenceOutcome;
  const directEffort = compareBody?.effort?.comparison;
  const publicText = JSON.stringify(proved.proof);
  const directPublicText = JSON.stringify(reuseBody?.observation ?? reuseBody);
  const privateAtoms = [projection.grossAtomic, projection.platformFeeAtomic, projection.contributorNetAtomic]
    .filter((value) => typeof value === "string" && value !== "0");
  const rewardDisclosed = containsPrivateAtom(proved.proof, privateAtoms) || containsPrivateAtom(directPublicText, privateAtoms);

  const feeMatch = projection.authorized
    ? feeBody?.FEE_BPS === 500
      && feeBody?.platformFeeAtomic === projection.platformFeeAtomic
      && feeBody?.contributorNetAtomic === projection.contributorNetAtomic
      && feeBody?.feeBasis === "new_job_gross"
    : feeStep.quoteNotCalled === true && projection.platformFeeAtomic === undefined && projection.feeBps === undefined;

  const comparison = {
    schema: WHOLE_EFFORT_SCHEMA,
    publicShowcase: false,
    scenario,
    pricingInvented: false,
    operatorCompute: "costs_unknown",
    monetaryCost: "costs_unknown",
    recomputeCostAvoidedNetOfUpkeep: "costs_unknown",
    hostedWalletMarketServer: "not_called",
    hostedWalletMarketServerReason: "Server claim and post write the hosted ledger and require funding. The direct fee step is vendor/hosted-wallet-market/src/fee.mjs.",
    composed: {
      stepCount: composedSteps.length,
      steps: composedSteps,
      evidenceOutcome: accepted.evidenceOutcome,
      effortComparison: projection.effortComparison,
      effortDisclosure: projection.effortDisclosure,
      feeReadout: projection.feeReadout,
      authorized: projection.authorized,
      feeBps: projection.feeBps,
      platformFeeAtomic: projection.platformFeeAtomic,
      contributorNetAtomic: projection.contributorNetAtomic,
      cumulativeFloorDelta: projection.cumulativeFloorDelta,
      equalNet: projection.equalNet,
      unknownCosts: projection.unknownCosts,
      rewardDisclosedPublicly: false,
    },
    direct: {
      stepCount: feeStep.skipped ? 3 : 4,
      teDiagnose: { exit: diagnose.status, evidenceOutcome: directEvidence, elapsedMs: diagnose.elapsedMs },
      teCompare: { exit: compare.status, comparison: directEffort, elapsedMs: compare.elapsedMs },
      resultReuse: { exit: reuse.status, mode: reuseBody?.mode, elapsedMs: reuse.elapsedMs },
      hostedWalletMarketFee: feeStep.skipped
        ? { skipped: true, reason: feeStep.reason, quoteNotCalled: true, exit: 0 }
        : {
            exit: feeStep.status,
            feeBps: feeBody?.FEE_BPS,
            platformFeeAtomic: feeBody?.platformFeeAtomic,
            contributorNetAtomic: feeBody?.contributorNetAtomic,
            elapsedMs: feeStep.elapsedMs,
          },
    },
    match: {
      evidenceOutcome: directEvidence === accepted.evidenceOutcome,
      effortComparison: directEffort === projection.effortComparison,
      fee: feeMatch,
      publicRewardOmitted: rewardDisclosed === false,
    },
    ...capabilityStamp(),
  };

  const exitsOk = diagnose.status === 0 && compare.status === 0 && reuse.status === 0 && feeStep.status === 0;
  const matched = comparison.match.evidenceOutcome
    && comparison.match.effortComparison
    && comparison.match.fee
    && comparison.match.publicRewardOmitted;
  if (!exitsOk || !matched) {
    return fail("whole_effort_mismatch", {
      comparison,
      diagnoseStderr: diagnose.stderr,
      compareStderr: compare.stderr,
      reuseStderr: reuse.stderr,
      feeStderr: feeStep.stderr,
    });
  }
  return { ok: true, comparison, proof: proved.proof };
}
