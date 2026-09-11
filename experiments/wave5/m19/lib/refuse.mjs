export class DistributionRefuse extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = "DistributionRefuse";
    this.code = code;
    this.detail = detail;
  }
}

export function refuse(code, message, detail) {
  return new DistributionRefuse(code, message, detail);
}

export function isRefuse(err) {
  return err instanceof DistributionRefuse;
}

export const CLOSED_GENERIC_OUTREACH = Object.freeze([
  "grexal-marketplace-scan",
  "unfiltered-mcp-search-as-latest",
  "multi-surface-blast",
  "invented-partner",
  "live-partner-email",
]);

export function outreachRefusal(kind, detail = {}) {
  return refuse(
    "closed-generic-outreach",
    "Closed generic outreach scans are not this assignment. Use one already-connected maintained distribution event.",
    { kind, closed: CLOSED_GENERIC_OUTREACH, ...detail },
  );
}
