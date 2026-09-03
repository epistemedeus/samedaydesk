// Distinct distribution surfaces that may list the same canonical resource.
// Each surface gets its own listing path so a settlement can be attributed
// to the registry that actually presented the URL.

export const DISTRIBUTION_SURFACES = Object.freeze([
  "bazaar",
  "agent402",
  "agentcash",
  "mcp-registry",
  "x402jobs",
  "mppscan",
]);

export const CANONICAL_SURFACE = "canonical";

const SURFACE_SET = new Set(DISTRIBUTION_SURFACES);

export function isDistributionSurface(value) {
  return typeof value === "string" && SURFACE_SET.has(value);
}

export function isReceiptSurface(value) {
  return value === CANONICAL_SURFACE || isDistributionSurface(value);
}

export function assertDistributionSurface(value) {
  if (!isDistributionSurface(value)) {
    throw new Error(`unknown distribution surface: ${String(value)}`);
  }
  return value;
}

export function listingMountPath(surface, canonicalPath) {
  assertDistributionSurface(surface);
  if (typeof canonicalPath !== "string" || !canonicalPath.startsWith("/")) {
    throw new Error("canonical path must be an absolute path");
  }
  return `/listings/${surface}${canonicalPath}`;
}
