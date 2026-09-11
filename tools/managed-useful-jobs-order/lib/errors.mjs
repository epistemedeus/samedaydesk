export class OrderRefuse extends Error {
  constructor(code, message, { httpStatus = 400, falsifier = null, detail = {} } = {}) {
    super(message);
    this.name = "OrderRefuse";
    this.code = code;
    this.httpStatus = httpStatus;
    this.falsifier = falsifier;
    this.detail = detail;
    this.exitCode = 2;
  }
}

export function formatRefuse(err, raw = {}) {
  const httpStatus = err instanceof OrderRefuse ? err.httpStatus : 500;
  return {
    schema: "samedaydesk.useful-jobs-consumer.v1",
    ok: false,
    orderId: raw?.orderId ?? null,
    engineId: raw?.engineId ?? null,
    sold: false,
    charged: false,
    purchaseAuthority: false,
    schedulerDaemon: false,
    sample: err instanceof OrderRefuse && (err.falsifier === "F-SAMPLE" || err.code.startsWith("sample")),
    code: err instanceof OrderRefuse ? err.code : "internal-error",
    error: err instanceof OrderRefuse ? err.message : String(err?.message || err),
    falsifier: err instanceof OrderRefuse ? err.falsifier : null,
    detail: err instanceof OrderRefuse ? err.detail : {},
    httpStatus,
    liveCatalogItem: false,
    productionExpressRoute: false,
    acceptanceClass: "fixture",
  };
}
