export class TrialRefuse extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = "TrialRefuse";
    this.code = code;
    this.detail = detail;
    this.exitCode = 2;
  }
}

export function trialRefuse(code, message, detail) {
  return new TrialRefuse(code, message, detail);
}

export class TrialTransport extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = "TrialTransport";
    this.code = code;
    this.detail = detail;
    this.exitCode = 1;
  }
}

export function trialTransport(code, message, detail) {
  return new TrialTransport(code, message, detail);
}
