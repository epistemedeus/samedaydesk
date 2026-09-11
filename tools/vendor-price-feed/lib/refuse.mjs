export function refuse(code, error, extra = {}) {
  return {
    ok: false,
    refused: true,
    code,
    error,
    purchaseAuthority: false,
    purchaseAuthorized: false,
    liveCatalogWritten: false,
    ...extra,
  };
}

export function ok(extra = {}) {
  return {
    ok: true,
    refused: false,
    purchaseAuthority: false,
    purchaseAuthorized: false,
    liveCatalogWritten: false,
    ...extra,
  };
}

export class FeedRefuse extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = "FeedRefuse";
    this.code = code;
    this.extra = extra;
  }

  toJSON() {
    return refuse(this.code, this.message, this.extra);
  }
}
