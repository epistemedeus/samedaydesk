export class CorpusRefuse extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = "CorpusRefuse";
    this.code = code;
    this.detail = detail;
  }
}

export function refuse(code, message, detail) {
  return new CorpusRefuse(code, message, detail);
}
