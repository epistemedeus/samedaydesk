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
  const sampleReasons = err.detail?.sampleReasons || [];
  const sample = err.code === "disguised-sample" || sampleReasons.length > 0;
  return {
    ok: false,
    refused: true,
    code: err.code || "error",
    error: err.message,
    detail: err.detail || null,
    sample,
    sampleReasons,
    engineInvoked: false,
    purchaseAuthority: false,
    spendClaim: false,
    toolCostClaim: false,
  };
}
