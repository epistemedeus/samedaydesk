import { evaluateAcceptance } from "./acceptance.mjs";
import { decideBundle } from "./bundle.mjs";
import { evaluateBundledEconomics, railsMeta } from "./economics.mjs";
import { compareEffort } from "./effort.mjs";
import { buildReceipt } from "./receipt.mjs";
import { validateBundle } from "./schema.mjs";

export { evaluateAcceptance } from "./acceptance.mjs";
export { decideBundle } from "./bundle.mjs";
export {
  FEE_BPS,
  FEE_MODULE,
  SOURCE_PIN,
  breakEvenGrossAtomic,
  evaluateBundledEconomics,
  evaluateTaskEconomics,
  railsMeta,
  separateVersusBundledFees,
  termsAuthorizeFeeReadout,
} from "./economics.mjs";
export { compareEffort } from "./effort.mjs";
export { buildReceipt } from "./receipt.mjs";
export { validateBundle } from "./schema.mjs";

export function evaluateBundle(input) {
  const validated = validateBundle(input);
  if (!validated.ok) return validated;

  const acceptance = evaluateAcceptance(validated.bundle);
  const economics = evaluateBundledEconomics(validated.bundle);
  const effort = compareEffort(validated.bundle);
  const bundleDecision = decideBundle({
    bundle: validated.bundle,
    acceptance,
    effort,
    economics,
  });

  return {
    ok: true,
    schema: "pilot.task-bundle-economics.evaluation.v1",
    signer: false,
    paymentCommand: false,
    fundedCommission: false,
    verifierExecuted: false,
    rails: railsMeta(),
    bundleId: validated.bundle.bundleId,
    requesterNote: validated.bundle.requesterNote,
    tasks: validated.bundle.tasks.map((task, index) => ({
      taskId: task.taskId,
      title: task.title,
      summary: task.summary,
      criteria: task.criteria,
      payableKinds: task.payableKinds,
      reservationId: task.reservationId,
      termsDigest: task.termsDigest,
      artifactDigest: task.artifactDigest,
      rightsDigest: task.rightsDigest,
      expectedRevision: task.expectedRevision,
      publicationConsent: task.publicationConsent,
      acceptance: acceptance.tasks[index],
      economics: economics.tasks[index],
      unknown: validated.unknown.tasks[index]?.unknown,
    })),
    bundledEconomics: economics.bundled,
    effort,
    bundleDecision,
    acceptanceSummary: acceptance.summary,
    preservedUnknown: {
      bundle: validated.unknown.bundle,
      bundleEffort: validated.unknown.bundleEffort,
    },
    bounds: validated.bounds,
  };
}

export function receiptFor(input) {
  const evaluation = evaluateBundle(input);
  if (!evaluation.ok) return evaluation;
  return buildReceipt(evaluation);
}

export function compareFor(input) {
  const evaluation = evaluateBundle(input);
  if (!evaluation.ok) return evaluation;
  return {
    ok: true,
    schema: "pilot.task-bundle-economics.compare.v1",
    signer: false,
    paymentCommand: false,
    rails: evaluation.rails,
    bundleId: evaluation.bundleId,
    effort: evaluation.effort,
    bundledEconomics: evaluation.bundledEconomics,
    perTaskEconomics: evaluation.tasks.map((task) => ({
      taskId: task.taskId,
      reservationId: task.reservationId,
      economics: task.economics,
    })),
    bundleDecision: evaluation.bundleDecision,
  };
}
