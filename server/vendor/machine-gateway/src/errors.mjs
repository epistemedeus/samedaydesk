export class GatewayError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export function fail(code, status = 400) { throw new GatewayError(code, status); }

// Provider exceptions and validation errors can contain credentials or input.
export function publicError(error) {
  return error instanceof GatewayError
    ? { status: error.status, body: { error: { code: error.code } } }
    : { status: 503, body: { error: { code: "service_unavailable" } } };
}
