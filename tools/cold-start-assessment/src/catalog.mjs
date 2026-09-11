import { AssessmentError } from "./errors.mjs";

export const SCHEMA = "samedaydesk.cold-start-assessment.v1";

/** Labelled fixture price only. Not posted. Cannot settle. */
export const PROPOSED_PRICE = Object.freeze({
  amount: "5.000000",
  asset: "USDC",
  network: "fixture",
});
export const PROPOSED_PRICE_ATOMIC = "5000000";

/** Existing live catalog amounts this adapter must not change. */
export const LIVE_EXTRACT = Object.freeze({
  amount: "5000",
  display: "0.005 USDC",
  route: "/extract",
});
export const LIVE_SELLER_INTEGRITY_AUDIT = Object.freeze({
  amount: "10000",
  display: "0.01 USDC",
  route: "/commerce/seller-integrity-audit",
});

/** Merchant PR54 is a metadata-continuity reference only. Not probed here. */
export const MERCHANT_PR54 = Object.freeze({
  repo: "epistemedeus/x402-url-extractor",
  defaultBranch: "master",
  merge: "a143898dd1ec35c097ca7eb0b472f30dad1ee319",
  note: "Metadata-continuity reference only. This adapter does not pay, settle, or clone the merchant.",
});

export const USEFUL_JOB_IDS = Object.freeze([
  "api-upgrade-brief",
  "vendor-budget-impact",
  "feed-agenda",
  "evidence-ci-annotation",
  "listing-repair-packet",
  "repeat-job-record",
]);

export const FORBIDDEN_REQUEST_HEADERS = Object.freeze([
  "authorization",
  "proxy-authorization",
  "cookie",
  "x-api-key",
  "x-github-token",
  "payment-signature",
  "payment-required",
  "x-payment",
  "x-payment-response",
  "x-402-payment",
]);

export const STRIP_CHILD_ENV = Object.freeze([
  "GITHUB_TOKEN",
  "GH_TOKEN",
  "GITHUB_PAT",
  "CURSOR_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "XAI_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_SECRET",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AUTHORIZATION",
]);

const GZIP_MIME = Object.freeze([
  "application/gzip",
  "application/x-gzip",
  "application/octet-stream",
]);

export const TARGETS = Object.freeze([
  {
    id: "capability-preflight",
    title: "Neomorphic capability preflight (Neo PR37)",
    acceptedRelease: {
      pr: 37,
      repo: "neomorphic-io (private; public HTTPS archive only)",
      merge: "45391e02fb97ee1eed0a050a12a94d540e9eb495",
    },
    live: {
      page: "https://neomorphic.io/labs/capability-preflight/",
      download: "https://neomorphic.io/downloads/capability-preflight/",
      status: "https://neomorphic.io/downloads/capability-preflight/release-status.json",
      archive: "https://neomorphic.io/downloads/capability-preflight/capability-preflight.tar.gz",
      bytes: 143275,
      sha256: "477e31cb09818409ff9fe81b9d8401bc227591be100a2aca7edf73ca1a45e551",
      hostedAcquisitionVerified: false,
    },
    contradictions: [
      "Packaged release-status.json still has hostedAcquisitionVerified:false / readyForRelease:false after a dated public GET of these exact bytes. Follow the live flag; a GET is not hosted job execution.",
    ],
    archiveRoot: "capability-preflight",
    entry: "bin/capability-consumer-kit.mjs",
    requiredFiles: ["bin/capability-consumer-kit.mjs"],
    offlineAfterExtract: true,
    enforceMime: true,
    allowedMime: GZIP_MIME,
    firstCommands: [
      { argv: ["status"], json: true },
      { argv: ["cold-start", "--probe"], json: true, demo: true },
      { argv: ["journey"], json: true, demo: true },
    ],
    honesty: {
      purchaseAuthority: false,
      actualCompletion: false,
      readyForRelease: false,
      paidCalls: false,
      demo: true,
    },
  },
  {
    id: "useful-jobs",
    title: "SameDayDesk useful jobs (PR51) — optional second target",
    acceptedRelease: {
      pr: 51,
      repo: "epistemedeus/samedaydesk",
      merge: "5b97d1b02e786acd1895cfa1508087ae3f7a1545",
    },
    live: {
      page: "https://samedaydesk.com/for-agents/useful-jobs",
      discovery: "https://samedaydesk.com/discovery/useful-jobs.json",
      archive: "https://samedaydesk.com/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz",
      bytes: 2522418,
      sha256: "6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51",
      sourceRepo: "epistemedeus/pilot",
      sourceCommit: "0e473974554de9bfdba90676b6d3d710c10a2671",
      archiveFreeze: "318130daaf19490e2f8af7c23131b42fe20e6cde",
    },
    contradictions: [
      "Brief/STATE pin SameDayDesk PR51 merge 5b97d1b0…. Live discovery pins.sourceCommit is 0e473974… on epistemedeus/pilot with archiveFreeze 318130da…. Archive bytes and sha256 still match. Follow live archive/discovery for acquire.",
    ],
    archiveRoot: "useful-jobs-1.0.0",
    entry: "bin/useful-jobs.mjs",
    requiredFiles: ["bin/useful-jobs.mjs", "catalog.json"],
    offlineAfterExtract: true,
    enforceMime: false,
    allowedMime: GZIP_MIME,
    firstCommands: [
      { argv: ["list"], json: false },
      { argv: ["help"], json: false },
      { argv: ["run", "api-upgrade-brief", "--example"], json: true, demo: true },
    ],
    honesty: {
      purchaseAuthority: false,
      actualCompletion: false,
      demo: true,
    },
  },
]);

export function targetById(id) {
  return TARGETS.find((row) => row.id === id) || null;
}

export function resolveNamedTarget(id) {
  const row = targetById(id);
  if (!row) {
    throw new AssessmentError("unknown_target", `unknown --target ${id}`, 2);
  }
  return row;
}

export function publicArchiveIsGitHub(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "github.com" || host === "api.github.com" || host.endsWith(".github.com");
  } catch {
    return /github\.com/i.test(String(url || ""));
  }
}
