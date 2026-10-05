export class CommissionRefuse extends Error {
  constructor(code, message, detail = null) {
    super(message);
    this.name = "CommissionRefuse";
    this.code = code;
    this.detail = detail;
  }
}
