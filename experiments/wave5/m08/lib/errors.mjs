export class ConsumerError extends Error {
  constructor(code, message, detail = null, { analysis = "refused", exitCode = 2 } = {}) {
    super(message);
    this.name = "ConsumerError";
    this.code = code;
    this.refused = true;
    this.detail = detail;
    this.analysis = analysis;
    this.exitCode = exitCode;
  }
}

export function refused(code, message, detail = null, extras = {}) {
  throw new ConsumerError(code, message, detail, extras);
}

export function toPublicError(err) {
  if (err instanceof ConsumerError) {
    return {
      ok: false,
      refused: true,
      code: err.code,
      error: err.message,
      detail: err.detail,
      analysis: err.analysis,
      paid: false,
      settled: false,
      nonsettling: true,
      purchaseAuthority: false,
    };
  }
  return {
    ok: false,
    refused: true,
    code: "error",
    error: err instanceof Error ? err.message : String(err),
    detail: null,
    analysis: "engine-failure",
    paid: false,
    settled: false,
    nonsettling: true,
    purchaseAuthority: false,
  };
}
