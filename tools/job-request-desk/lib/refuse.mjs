export class DeskRefuse extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = "DeskRefuse";
    this.code = code;
    this.detail = detail;
    this.exitCode = 2;
  }
}

export function refuse(code, message, detail) {
  return new DeskRefuse(code, message, detail);
}

export function rejectionEnvelope({ code, message, detail, engineId = null, requestId = null }) {
  return {
    ok: false,
    refused: true,
    code,
    error: message,
    detail: detail || null,
    engineId,
    requestId,
    sold: false,
    purchaseAuthority: false,
    fundingState: "rejected",
    liveSettleAllowed: false,
    liveSettleAttempted: false,
  };
}
