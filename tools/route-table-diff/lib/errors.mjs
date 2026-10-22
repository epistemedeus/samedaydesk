export class RouteDiffError extends Error {
  constructor(code, message, detail = null) {
    super(message);
    this.name = "RouteDiffError";
    this.code = code;
    this.refused = true;
    this.detail = detail;
    this.exitCode = 2;
  }
}

export function refused(code, message, detail = null) {
  throw new RouteDiffError(code, message, detail);
}

export function toPublicError(err) {
  if (err instanceof RouteDiffError) {
    return {
      ok: false,
      refused: true,
      code: err.code,
      error: err.message,
      detail: err.detail,
    };
  }
  return {
    ok: false,
    refused: true,
    code: "error",
    error: err instanceof Error ? err.message : String(err),
    detail: null,
  };
}
