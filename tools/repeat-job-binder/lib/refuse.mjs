export class BinderRefuse extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = "BinderRefuse";
    this.code = code;
    this.detail = detail;
    this.exitCode = 2;
  }

  toJSON() {
    return {
      ok: false,
      refused: true,
      code: this.code,
      error: this.message,
      detail: this.detail,
      schedulerDaemon: false,
      purchaseAuthority: false,
      settling: false,
      paidValueClaim: false,
    };
  }
}

export function refuse(code, message, detail) {
  return new BinderRefuse(code, message, detail);
}

export function emitRefuse(err) {
  const payload =
    err instanceof BinderRefuse
      ? err.toJSON()
      : {
          ok: false,
          refused: true,
          code: err?.code || "internal-error",
          error: String(err?.message || err),
          detail: err?.detail || null,
          schedulerDaemon: false,
          purchaseAuthority: false,
          settling: false,
          paidValueClaim: false,
        };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
  process.exit(err?.exitCode || 2);
}
