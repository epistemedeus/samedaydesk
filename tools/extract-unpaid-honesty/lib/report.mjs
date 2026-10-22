import { scanText } from "./inspect.mjs";
import { hashTermsVersion } from "./hash-terms.mjs";
import {
  F18_SHA,
  I01_HASH_TERMS_BINDING,
  PAID_PRODUCTS,
  SDS_MAIN_SHA,
  USEFUL_JOBS_ARCHIVE_BYTES,
  USEFUL_JOBS_ARCHIVE_SHA256,
  USEFUL_JOBS_PACKAGE,
  USEFUL_JOBS_VERSION,
} from "./pins.mjs";

export function honestyTerms(loaded) {
  return {
    schema: "samedaydesk.extract-unpaid-honesty.terms.v1",
    purchaseAuthority: false,
    schedulerDaemon: false,
    sold: false,
    settled: false,
    paidProducts: [...PAID_PRODUCTS],
    mustNotRun: [...(loaded.stop?.mustNotRun || [])],
    usefulJobs: {
      package: USEFUL_JOBS_PACKAGE,
      version: USEFUL_JOBS_VERSION,
      sha256: USEFUL_JOBS_ARCHIVE_SHA256,
      bytes: USEFUL_JOBS_ARCHIVE_BYTES,
    },
  };
}

export function buildReport({ loaded, spawnResult, log, intercept, kit }) {
  const fixtureMustNotRun = [...(loaded.stop?.mustNotRun || [])];
  const forbidden = (log || []).filter((entry) => entry.forbidden);
  const textScan = scanText(`${spawnResult.stdout || ""}\n${spawnResult.stderr || ""}`);
  const extractUrlObserved = forbidden.some((entry) =>
    (entry.reasons || []).some((reason) => reason === "extract-url" || reason === "extract-batch-url"),
  ) || textScan.reasons.includes("extract-url") || textScan.reasons.includes("extract-batch-url");
  const sellerIntegrityObserved =
    forbidden.some((entry) => (entry.reasons || []).includes("seller-integrity-url")) ||
    textScan.reasons.includes("seller-integrity-url");
  const paymentSignaturePresent =
    forbidden.some((entry) => (entry.reasons || []).includes("payment-header")) ||
    textScan.reasons.includes("payment-header");

  const mustNotRunPreserved =
    JSON.stringify(fixtureMustNotRun) === JSON.stringify(loaded.stop.mustNotRun);

  const terms = honestyTerms(loaded);
  const termsVersion = hashTermsVersion(terms);
  const jobOk = spawnResult.json?.ok === true && spawnResult.status === 0;
  const interceptClean = forbidden.length === 0 && !textScan.forbidden;
  const ok = jobOk && interceptClean && loaded.purchaseAuthority === false && mustNotRunPreserved;

  return {
    ok,
    schema: "samedaydesk.extract-unpaid-honesty.report.v1",
    purchaseAuthority: false,
    sold: false,
    settled: false,
    sample: Boolean(spawnResult.example),
    job: {
      id: spawnResult.jobId,
      example: spawnResult.example,
      status: spawnResult.status,
      engineOk: spawnResult.json?.ok === true,
      appId: spawnResult.json?.appId || null,
      engineStatus: spawnResult.json?.status || null,
      outDir: spawnResult.outDir,
    },
    extractUrlObserved,
    extractBatchObserved: forbidden.some((entry) => (entry.reasons || []).includes("extract-batch-url")),
    sellerIntegrityObserved,
    paymentSignaturePresent,
    mustNotRun: fixtureMustNotRun,
    mustNotRunPreserved,
    mustNotRunViolations: forbidden,
    intercept: {
      kind: intercept.kind,
      origin: intercept.origin,
      listen: `127.0.0.1:${intercept.port}`,
      requestCount: (log || []).length,
      forbiddenCount: forbidden.length,
      class: "local-runtime",
    },
    kit: {
      sha256: kit?.sha256 || USEFUL_JOBS_ARCHIVE_SHA256,
      bytes: kit?.bytes || USEFUL_JOBS_ARCHIVE_BYTES,
      class: "local-runtime",
    },
    catalogs: {
      usefulJobsPurchaseAuthority: loaded.usefulCatalog.runtime.purchaseAuthority,
      discoveryPurchaseAuthority: loaded.discovery.purchaseAuthority,
      paidExtractOffer: loaded.paidExtract?.id || null,
      paidExtractPayment: loaded.paidExtract?.payment || null,
      class: "fixture",
    },
    contrast: {
      buyerRuntimes: "stops at unpaid 402 construct; does not spawn useful-jobs",
      f18: `live GET/HEAD of SDS pages and merchant 402 fixtures on Pilot ${F18_SHA}; this module does not repeat live GET`,
      f18Fixture: "fixtures/contrast/f18-merchant-extract-402.json",
    },
    termsVersion,
    hashTermsBinding: I01_HASH_TERMS_BINDING,
    sdsMain: SDS_MAIN_SHA,
    laterBindings: loaded.laterBindings,
    evidenceClass: {
      catalogs: "fixture",
      stopFixture: "fixture",
      jobSpawn: "local-runtime",
      intercept: "local-runtime",
      f18: "fixture-contrast",
      postgres: "not-used",
      liveGet: "not-run",
    },
  };
}
