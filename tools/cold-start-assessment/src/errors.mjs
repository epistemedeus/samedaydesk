export class AssessmentError extends Error {
  constructor(code, message, exitCode = 1, extra = {}) {
    super(message);
    this.name = "AssessmentError";
    this.code = code;
    this.exitCode = exitCode;
    this.extra = extra;
  }
}
