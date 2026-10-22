export class MailboxError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = "MailboxError";
    this.code = code;
    this.exitCode = extra.exitCode ?? 2;
    this.detail = extra.detail ?? null;
    this.status = extra.status ?? null;
  }
}

export function refuse(code, message, extra = {}) {
  return new MailboxError(code, message, extra);
}

export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function failBody(err, extra = {}) {
  const error = err instanceof MailboxError ? err : refuse("error", err?.message || String(err));
  return {
    ok: false,
    refused: true,
    code: error.code,
    error: error.message,
    status: extra.status || error.status || error.code,
    deliveredToBuyer: false,
    sample: extra.sample === true,
    purchaseAuthority: false,
    sold: false,
    liveSettlement: "out-of-scope",
    detail: error.detail,
    ...extra,
  };
}
