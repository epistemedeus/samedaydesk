export class OutboxRefuse extends Error {
  constructor(code, message, detail = null) {
    super(message);
    this.name = "OutboxRefuse";
    this.code = code;
    this.detail = detail;
  }
}

export function refuse(code, message, detail = null) {
  throw new OutboxRefuse(code, message, detail);
}
