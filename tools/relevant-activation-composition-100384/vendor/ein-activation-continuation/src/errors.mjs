/** SPDX-License-Identifier: MIT */

export class ContinuationError extends Error {
  constructor({
    code = "continuation_error",
    message,
    status = null,
    retryable = false,
    recovery = null,
    causeCode = null,
    operation = null,
  } = {}) {
    super(message || "continuation failed");
    this.name = "ContinuationError";
    this.code = code;
    this.status = status;
    this.retryable = retryable === true;
    this.recovery = recovery;
    this.causeCode = causeCode;
    this.operation = operation;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      status: this.status,
      retryable: this.retryable,
      ...(this.causeCode ? { cause: this.causeCode } : {}),
      ...(this.operation ? { operation: this.operation } : {}),
      ...(this.recovery ? { recovery: this.recovery } : {}),
    };
  }
}

export function recovery(action, instruction) {
  return { action, instruction };
}
