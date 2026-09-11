export class PreflightRefuse extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = "PreflightRefuse";
    this.code = code;
    this.detail = detail;
    this.exitCode = 2;
  }
}

export function refuse(code, message, detail) {
  return new PreflightRefuse(code, message, detail);
}

export function resultFromRefuse(err) {
  return {
    ok: false,
    refused: true,
    code: err.code || "error",
    error: err.message,
    detail: err.detail || null,
    engineInvoked: false,
    purchaseAuthority: false,
    spendClaim: false,
    toolCostClaim: false,
  };
}
