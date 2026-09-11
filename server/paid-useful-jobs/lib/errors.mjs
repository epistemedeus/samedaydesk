export class WrapperRefuse extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = "WrapperRefuse";
    this.code = code;
    this.detail = detail;
  }
}

export function refuse(code, message, detail) {
  return new WrapperRefuse(code, message, detail);
}
