export class ExportRefuse extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = "ExportRefuse";
    this.code = code;
    this.detail = detail;
    this.exitCode = 2;
  }
}

export function refuse(code, message, detail) {
  return new ExportRefuse(code, message, detail);
}
