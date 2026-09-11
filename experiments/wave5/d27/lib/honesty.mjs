import { BUYER_CLASS } from "./contract.mjs";

const EVIDENCE_CHANNELS = new Set(["operator-handoff", "field-pack"]);

export function checkHonesty({ buyerClass, recruitmentEvidence = null, demandClaim = null } = {}) {
  if (!buyerClass || !Object.values(BUYER_CLASS).includes(buyerClass)) {
    return {
      refused: true,
      code: "missing-buyer-class",
      message: "buyerClass must be owner-qa, recruited-independent, or unknown",
    };
  }

  if (buyerClass === BUYER_CLASS.UNKNOWN) {
    return {
      refused: true,
      code: "unknown-buyer-class",
      message: "unknown cannot run a trial labelled useful or recruited",
    };
  }

  if (demandClaim === "organic" || demandClaim === "independent-utility" || demandClaim === true) {
    return {
      refused: true,
      code: "invented-demand",
      message: "This kit does not attest organic or independent-utility demand",
    };
  }

  if (buyerClass === BUYER_CLASS.RECRUITED_INDEPENDENT) {
    if (!recruitmentEvidence || typeof recruitmentEvidence !== "object") {
      return {
        refused: true,
        code: "recruitment-not-executed",
        message: "recruited-independent requires operator-held evidence; this worker does not invent it",
      };
    }
    const operatorId = recruitmentEvidence.operatorId;
    const grantedAt = recruitmentEvidence.grantedAt;
    const channel = recruitmentEvidence.channel;
    if (typeof operatorId !== "string" || !operatorId.trim()) {
      return {
        refused: true,
        code: "recruitment-not-executed",
        message: "recruitment evidence needs a non-empty operatorId",
      };
    }
    if (typeof grantedAt !== "string" || !grantedAt) {
      return {
        refused: true,
        code: "recruitment-not-executed",
        message: "recruitment evidence needs grantedAt",
      };
    }
    if (!EVIDENCE_CHANNELS.has(channel)) {
      return {
        refused: true,
        code: "recruitment-not-executed",
        message: "recruitment evidence channel must be operator-handoff or field-pack",
      };
    }
  }

  return { refused: false, code: null };
}
