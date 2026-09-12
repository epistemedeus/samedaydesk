export class ConsumerRefuse extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = "ConsumerRefuse";
    this.code = code;
    this.detail = detail;
  }
}
