import {
  CLAIM_AUTHORITY,
  CODE,
  DESK_ROLE,
  EARNED_WORK,
  HONESTY_NOTES,
  PACK_ID,
  PACK_VERSION,
  PAYMENT_AUTHORITY,
  SCHEMA,
  SETTLEMENT_RECEIPT_VIEW,
  WAVE_ID,
} from "./constants.mjs";
import { DeskError } from "./errors.mjs";
import { openAdapter } from "./adapters/index.mjs";
import { redactDeep } from "./redact.mjs";

export function envelope(body, extra = {}) {
  return redactDeep({
    ok: true,
    schema: SCHEMA,
    packId: PACK_ID,
    packVersion: PACK_VERSION,
    waveId: WAVE_ID,
    role: DESK_ROLE,
    walletless: true,
    paymentAuthority: PAYMENT_AUTHORITY,
    claimAuthority: CLAIM_AUTHORITY,
    earnedWork: EARNED_WORK,
    actualCompletion: false,
    settlementReceiptView: SETTLEMENT_RECEIPT_VIEW,
    ...extra,
    ...body,
  });
}

export function createDesk(options = {}) {
  const adapter = openAdapter(options);

  return {
    adapterKind: adapter.kind,
    async browse() {
      return envelope({ action: "browse", result: await adapter.browse() });
    },
    async claim(input) {
      return envelope({ action: "claim", result: await adapter.claim(input) });
    },
    async status(input) {
      return envelope({ action: "status", result: await adapter.status(input) });
    },
    async appeal(input) {
      return envelope({ action: "appeal", result: await adapter.appeal(input) });
    },
    async owedVersusPaid(input) {
      return envelope({ action: "owed_versus_paid", result: await adapter.owedVersusPaid(input) });
    },
    async journey(input = {}) {
      const contributorPublicId = input.contributorPublicId || "ctr_walrus";
      const browse = await adapter.browse();
      const claim = await adapter.claim({
        taskId: input.claimTaskId || "tsk_open_alpha",
        contributorPublicId,
        termsVersion: input.termsVersion,
      });
      const status = await adapter.status({ taskId: input.claimTaskId || "tsk_open_alpha" });
      const appeal = await adapter.appeal({
        taskId: input.appealTaskId || "tsk_rejected_gamma",
        contributorPublicId: input.appealContributorId || "ctr_gamma",
        reason: input.appealReason || "Bound digest was labelled against the wrong fixture note.",
      });
      const owed = await adapter.owedVersusPaid({ taskId: input.owedTaskId || "tsk_owed_delta" });
      return envelope({
        action: "journey",
        walletlessBrowseClaimStatus: true,
        honesty: HONESTY_NOTES,
        steps: { browse, claim, status, appeal, owedVersusPaid: owed },
      });
    },
  };
}

export function failureEnvelope(error) {
  const json = error instanceof DeskError ? error.toJSON() : { ok: false, code: CODE.INVALID_INPUT, message: String(error) };
  return redactDeep({
    schema: SCHEMA,
    packId: PACK_ID,
    waveId: WAVE_ID,
    walletless: true,
    earnedWork: EARNED_WORK,
    actualCompletion: false,
    settlementReceiptView: SETTLEMENT_RECEIPT_VIEW,
    ...json,
  });
}

export function publicContract() {
  return {
    schema: SCHEMA,
    packId: PACK_ID,
    packVersion: PACK_VERSION,
    waveId: WAVE_ID,
    title: "Walletless public contributor desk",
    walletless: true,
    actions: ["browse", "claim", "status", "appeal", "owed_versus_paid"],
    paymentAuthority: PAYMENT_AUTHORITY,
    claimAuthority: CLAIM_AUTHORITY,
    earnedWork: EARNED_WORK,
    actualCompletion: false,
    settlementReceiptView: SETTLEMENT_RECEIPT_VIEW,
    seededFailure: {
      code: CODE.DESK_HOLDS_EARNED_WORK_SECRET,
      when: "Desk process holds EARNED_WORK_OWNER_TOKEN or a sibling EARNED_WORK secret",
    },
    kill: {
      code: CODE.CONTRIBUTOR_HOLDS_PAYOUT_KEY,
      when: "Contributor session holds payout-key material",
    },
    honesty: HONESTY_NOTES,
    page: "/labs/contributor-desk/",
  };
}
