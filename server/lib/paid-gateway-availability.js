import { readFileSync } from "node:fs";

export const GATEWAY_ORIGIN = "https://agents.samedaydesk.com";
export const AVAILABILITY_PATH = new URL("../config/paid-gateway-availability.json", import.meta.url);
const RECEIVED_CHECKS = ["configuredRuntime", "freshAuthority", "oldAuthorityRefused", "retainedState", "sharedConsumers"];

// This is a received dependency state, not a health probe or a launch ledger.
export function validateGatewayState(input) {
  if (!input || !["available", "paused", "unknown"].includes(input.state)) throw new Error("Unknown gateway state");
  if (typeof input.observedAt !== "string" || !Number.isFinite(Date.parse(input.observedAt)) ||
      new Date(input.observedAt).toISOString() !== input.observedAt) throw new Error("Gateway ISO observation time required");
  if (input.state === "available") {
    const evidence = input.received;
    if (!evidence || !/^[a-f0-9]{40}$/.test(evidence.sourceCommit || "") ||
        typeof evidence.deploymentId !== "string" || !evidence.deploymentId.trim() ||
        typeof evidence.receipt !== "string" || !evidence.receipt.trim() ||
        evidence.observedAt !== input.observedAt ||
        !RECEIVED_CHECKS.every((name) => evidence[name] === true)) {
      throw new Error("Available requires received configured runtime and authority evidence");
    }
  }
  return input;
}

export function readGatewayState() {
  try { return validateGatewayState(JSON.parse(readFileSync(AVAILABILITY_PATH, "utf8"))); }
  catch { return { state: "unknown", observedAt: null }; }
}

export function gatewayAvailability(input = readGatewayState()) {
  let state;
  try { state = validateGatewayState(input); }
  catch { state = { state: "unknown", observedAt: null }; }
  const callable = state.state === "available";
  const summary = callable
    ? "Web data for AI agents, priced per call in USDC. Read the current inventory before submitting."
    : "Use the free website checks and offline comparison tools.";
  return {
    origin: GATEWAY_ORIGIN,
    state: state.state,
    callable,
    observedAt: state.observedAt,
    summary,
    nextAction: callable ? `${GATEWAY_ORIGIN}/.well-known/x402` : "https://samedaydesk.com/discovery/useful-jobs.json",
    alternatives: {
      freeApexMcp: "https://samedaydesk.com/mcp",
      offlinePackages: "https://samedaydesk.com/discovery/useful-jobs.json",
      originalTask: "https://samedaydesk.com/discovery/original-task-correspondence.json",
    },
    preservation: "Free apex tools, original-task correspondence and hosted offline archives are separate. Acquired packages remain usable offline; retained entitlements are unchanged.",
  };
}

export function gatewayGuideBlock(input) {
  const availability = gatewayAvailability(input);
  return [
    "<!-- paid-gateway:start -->",
    ...(availability.callable ? [
      `- [Paid machine gateway MCP](${GATEWAY_ORIGIN}/mcp): Web data for AI agents, priced per call in USDC.`,
      `- Practical paid job: \`POST ${GATEWAY_ORIGIN}/extract/batch\`. Read the current inventory and prices before submitting.`,
      ...[["Tool inventory and prices", "/.well-known/x402"], ["Gateway instructions", "/llms.txt"], ["HTTP action catalog", "/api/actions"]]
        .map(([label, path]) => `- [${label}](${GATEWAY_ORIGIN}${path})`),
    ] : ["- [Free local checks and comparisons](https://samedaydesk.com/discovery/useful-jobs.json)"]),
    "<!-- paid-gateway:end -->",
  ].join("\n");
}
