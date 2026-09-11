import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  LIVE_EXTRACT,
  LIVE_SELLER_INTEGRITY_AUDIT,
  MERCHANT_PR54,
  PROPOSED_PRICE,
  PROPOSED_PRICE_ATOMIC,
  SCHEMA,
} from "./catalog.mjs";
import { renderExplanation } from "./explain.mjs";

export function buildAssessment({
  target,
  mode,
  acquisition,
  commands = [],
  contract = { ok: false, findings: [], honesty: {} },
  extra = {},
}) {
  const honesty = contract.honesty || {};
  const samplePaid = honesty.sampleLabelledAsPaidCompletion === true;
  const acquired = acquisition?.ok === true && acquisition?.extracted === true;
  const commandsOk = commands.length > 0 && commands.every((row) => row.exitCode === 0);
  const usable =
    acquired &&
    commandsOk &&
    contract.ok === true &&
    samplePaid === false &&
    honesty.innerPurchaseAuthority !== true &&
    honesty.innerActualCompletion !== true;

  return {
    schema: SCHEMA,
    ok: usable,
    usableReproduction: usable,
    label: usable ? "usable_reproduction" : "rejected",
    purchaseAuthority: false,
    fundingState: "fixture",
    actualCompletion: false,
    sold: false,
    liveSettleAttempted: false,
    paymentHeadersSent: false,
    credentialsUsed: false,
    githubCredentialsRequired: false,
    cannotSettle: true,
    publishedToLiveCatalog: false,
    proposedPrice: { ...PROPOSED_PRICE },
    proposedPriceAtomic: PROPOSED_PRICE_ATOMIC,
    mode,
    target: {
      id: target.id,
      title: target.title,
      acceptedRelease: target.acceptedRelease,
      live: {
        page: target.live.page,
        archive: target.live.archive,
        bytes: target.live.bytes,
        sha256: target.live.sha256,
      },
      contradictions: target.contradictions || [],
    },
    acquisition: {
      ok: Boolean(acquisition?.ok),
      extracted: Boolean(acquisition?.extracted),
      stoppedBeforeExtract: Boolean(acquisition?.stoppedBeforeExtract),
      status: acquisition?.status ?? 0,
      bytes: acquisition?.bytes ?? 0,
      sha256: acquisition?.sha256 ?? null,
      expectedBytes: acquisition?.expectedBytes ?? target.live.bytes,
      expectedSha256: acquisition?.expectedSha256 ?? target.live.sha256,
      url: acquisition?.url || target.live.archive,
      code: acquisition?.code || null,
      message: acquisition?.message || null,
      githubCredentialsRequired: false,
    },
    commands,
    contract: {
      ok: Boolean(contract.ok) && !samplePaid,
      findings: contract.findings || [],
    },
    honesty: {
      purchaseAuthority: false,
      actualCompletion: false,
      demo: Boolean(honesty.demo),
      customerCompletion: false,
      sampleLabelledAsPaidCompletion: samplePaid,
      paid: false,
    },
    merchantContinuity: { ...MERCHANT_PR54 },
    liveCatalogUnchanged: {
      extract: { ...LIVE_EXTRACT },
      sellerIntegrityAudit: { ...LIVE_SELLER_INTEGRITY_AUDIT },
    },
    ...extra,
  };
}

export function writeAssessmentFiles(outDir, assessment) {
  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, "assessment.json");
  const mdPath = join(outDir, "explanation.md");
  writeFileSync(jsonPath, `${JSON.stringify(assessment, null, 2)}\n`);
  writeFileSync(mdPath, renderExplanation(assessment));
  return { jsonPath, mdPath };
}
