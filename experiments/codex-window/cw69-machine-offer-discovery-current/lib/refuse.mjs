export class OfferRefuse extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = "OfferRefuse";
    this.code = code;
    this.detail = detail && typeof detail === "object" ? detail : { value: detail };
    this.ok = false;
    this.refused = true;
  }

  toJSON() {
    return {
      ok: false,
      refused: true,
      code: this.code,
      error: this.message,
      detail: this.detail,
      purchaseAuthority: false,
      sold: false,
    };
  }
}

export function refuse(code, message, detail) {
  return new OfferRefuse(code, message, detail);
}

export function asRefusePayload(err) {
  if (err instanceof OfferRefuse) return err.toJSON();
  return {
    ok: false,
    refused: true,
    code: err?.code || "internal-error",
    error: String(err?.message || err),
    detail: {},
    purchaseAuthority: false,
    sold: false,
  };
}
