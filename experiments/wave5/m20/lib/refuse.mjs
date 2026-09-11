export function refuse(code, message, extra = {}) {
  return {
    ok: false,
    refused: true,
    code,
    error: message,
    purchaseAuthority: false,
    independentDemand: false,
    organicDemand: false,
    paidReturn: false,
    ...extra,
  };
}
