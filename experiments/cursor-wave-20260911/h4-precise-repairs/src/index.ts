export type { RepairIntake, MetadataDiagnostic, CanaryDesign } from "./types.ts";
export { SEEDED_FAILURES } from "./failures.ts";
export {
  acceptRepairIntake,
  completeRepair,
  intakeFromFixture,
  suppliedInputOk,
  isFixtureSampleOrExample,
} from "./intake.ts";
export {
  diagnosePaymentPayload,
  assertHonestDiagnostics,
  markFieldSigned,
} from "./diagnostics.ts";
export { designCanary, invokeLiveSettle, executeCanaryPurchase } from "./canary.ts";
export { designExactRepairProposal } from "./proposal.ts";
export { listRepairSubjects, requireSubject } from "./subjects.ts";
export {
  refusePriceChange,
  refusePaymentFnReassignment,
  assertLivePricesUnchanged,
  scanPackSourceForPaymentReassignment,
} from "./guardrails.ts";
export {
  SUBJECT_JOB_IDS,
  LIVE_PRICES,
  MERCHANT_PIN,
  SDS_START_HEAD,
  FEATURE_BRANCH,
  H4R_BRANCH,
  SESSION_ID,
  H4R_SESSION_ID,
  COMPARE_URL,
} from "./constants.ts";
export { loadCorpus, evaluateCorpus, runCorpus, corpusCommand } from "./corpus.ts";
export { REQUIRED_CORPUS_IDS } from "./corpus-types.ts";
export {
  reproduceSampleReservedFunding,
  rejectSampleFundingAsNotASale,
  livePaidUsefulJobsPresent,
} from "./f08-sample-funding.ts";
export { diagnoseHealthSurface, reproduceF18Health } from "./f18-health.ts";
export { compareCompressedLengthToDecoded, assertCompressedLengthIsNotJsonPin } from "./f18-bytes.ts";
export { interpretUnpaid402, assert402IsNotSuccess, classifyProbe } from "./f18-402.ts";
export { assertSampleIsNotCustomerUse, strengthenFixtureBecomesSale } from "./f18-sample.ts";
export { refuseNeoPatchedOnSdsClaim, assertCanaryMustNotSettle } from "./guardrail-h4r.ts";
export { assertNotPatchedOnSds, scanPackClaimsNeoPatched } from "./neo-scope.ts";
