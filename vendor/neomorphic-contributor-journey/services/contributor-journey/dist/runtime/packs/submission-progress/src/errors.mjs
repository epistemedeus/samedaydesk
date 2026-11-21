export class ProgressError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {{ document?: object, status?: number }} [extras]
   */
  constructor(code, message, extras = {}) {
    super(message);
    this.name = "ProgressError";
    this.code = code;
    this.document = extras.document ?? null;
    this.status = extras.status ?? null;
  }
}

export function errorBody(error) {
  const code =
    error instanceof ProgressError
      ? error.code
      : typeof error?.code === "string"
        ? error.code
        : "invalid_input";
  return {
    ok: false,
    error: {
      code,
      message: error instanceof Error ? error.message : String(error),
    },
    document: error instanceof ProgressError ? error.document : null,
  };
}
