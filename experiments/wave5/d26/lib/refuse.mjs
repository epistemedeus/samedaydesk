export class ExperimentRefuse extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = "ExperimentRefuse";
    this.code = code;
    this.detail = detail;
  }
}

export function refuse(code, message, detail = {}) {
  return {
    ok: false,
    refused: true,
    certified: false,
    nonLossmaking: false,
    sold: false,
    publishedToLiveCatalog: false,
    liveSettleAttempted: false,
    purchaseAuthority: false,
    independentDemand: false,
    code,
    error: message,
    detail,
  };
}

export function throwRefuse(code, message, detail = {}) {
  throw new ExperimentRefuse(code, message, detail);
}
