export class AcquisitionRefuse extends Error {
  constructor(code, message, { httpStatus = 400, state = null, detail = {} } = {}) {
    super(message);
    this.name = "AcquisitionRefuse";
    this.code = code;
    this.httpStatus = httpStatus;
    this.state = state;
    this.detail = detail;
  }
}

const STATUS = {
  "not-found": 404,
  pending: 202,
  expired: 410,
  "identity-conflict": 409,
  "integrity-failed": 422,
  oversize: 413,
  "capacity-exhausted": 503,
  "uncertain-clock": 503,
  "store-unavailable": 503,
  aborted: 499,
  timeout: 504,
  "missing-admission": 409,
  "untrusted-principal": 400,
  "untrusted-clock": 400,
  "invalid-binding": 400,
  "invalid-name": 400,
  "hostile-path": 400,
};

const RESULT_STATES = new Set([
  "pending",
  "not-found",
  "expired",
  "identity-conflict",
  "integrity-failed",
]);

export function acquisitionRefuse(code, message, extra = {}) {
  const httpStatus = extra.httpStatus ?? STATUS[code] ?? 400;
  const state = extra.state !== undefined ? extra.state : RESULT_STATES.has(code) ? code : null;
  return new AcquisitionRefuse(code, message, { ...extra, httpStatus, state });
}
